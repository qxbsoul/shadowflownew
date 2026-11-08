"""OPC OS（backend-poc company/orders/pay 移植）契约测试。

覆盖三层：
  opc_store   — sqlite 存储与订单事件流
  opc_company — 组织/员工/项目协议/审批/账本（真实 live 返回的测试替身）
  opc_orders  — 订单状态机：created → pending_payment → paid → running → delivered

隔离：conftest._isolate_shadowflow_data 已把 opc_store._BASE_DIR/_DB_PATH
重定向到 session tmp 根；SHADOWFLOW_OPC_DB 再逐函数覆盖（opc_store 的
_CONN 单例跨用例残留，故每函数 reset 后用独立文件）。
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from shadowflow.services import opc_company, opc_orders, opc_pay, opc_seed, opc_store
from shadowflow.services.opc_orders import OrderError


@pytest.fixture(autouse=True)
def live_llm(monkeypatch):
    """旧状态机用例只替换网络出口，返回与 Node 相同的 live 契约。"""
    def complete(system, user, meta, execution_context=None):
        return {
            "text": "真实模型测试交付", "thinking": "测试推理", "mode": "live",
            "model": meta.get("model") or "gpt-4o", "usage": {"input_tokens": 10, "output_tokens": 5},
        }
    monkeypatch.setattr(opc_company, "_llm_complete", complete)


@pytest.fixture()
def opc_db(tmp_path, monkeypatch):
    """每个测试独立 sqlite 文件 + 重置连接单例。"""
    db_file = tmp_path / "opc.sqlite"
    monkeypatch.setenv("SHADOWFLOW_OPC_DB", str(db_file))
    monkeypatch.setattr(opc_store, "_DB_PATH", db_file)
    opc_store._CONN = None  # noqa: SLF001 — 测试需要重置模块级单例
    monkeypatch.setattr(opc_store, "_CONN", None)
    opc_store.init()
    opc_seed.ensure_seed()
    yield opc_store
    opc_store._CONN = None  # noqa: SLF001
    monkeypatch.setattr(opc_store, "_CONN", None)


@pytest.fixture()
def simulated_pay(monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "simulated")
    yield
    monkeypatch.delenv("SF_PAY_MODE", raising=False)


# ------------------------------------------------------------------ seed / store


def test_seed_idempotent_company_roster_products(opc_db):
    companies = opc_company.list_companies()
    assert len(companies) == 1
    co = companies[0]
    assert co["name"] == "增长工场 Growth Studio"
    assert co["cash_cents"] == 200000

    depts = opc_company.list_departments(co["id"])
    assert len(depts) == len(opc_seed.DEPARTMENTS)
    # 部门负责人 = 该部门第一位入职员工
    heads = [d["head_employee_id"] for d in depts]
    assert all(heads), "每个部门都应自动任命负责人"

    roster = opc_company.roster(co["id"])
    assert len(roster) == 9

    products = opc_store.list_products()
    assert [p["id"] for p in products] == ["svc_content", "svc_compliance", "svc_landing_sel"]
    assert all(p["active"] for p in products)

    # 幂等：再跑一次不重复建
    opc_seed.ensure_seed()
    assert len(opc_company.list_companies()) == 1
    assert len(opc_company.roster(co["id"])) == 9


def test_order_events_stream(opc_db):
    order = opc_store.create_order(
        {
            "id": "ord_t1", "product_id": "svc_content", "product_name": "内容转化包",
            "buyer_name": "t", "contact": "", "requirement": "测试需求",
            "amount_cents": 2900, "status": "created", "created_at": opc_store.now(),
        }
    )
    seq = opc_store.emit_order(order["id"], "order.created", {"k": 1})
    assert seq >= 1
    events = opc_store.order_events_since(order["id"], 0)
    assert events and events[0]["type"] == "order.created"
    assert events[0]["payload"]["k"] == 1  # 返回时已解析为 dict
    # since 游标：只取新增
    opc_store.emit_order(order["id"], "order.paid", {})
    tail = opc_store.order_events_since(order["id"], seq)
    assert [e["type"] for e in tail] == ["order.paid"]


# ------------------------------------------------------------------ pay gateway


def test_pay_info_simulated_by_default(simulated_pay):
    info = opc_pay.info()
    assert info["mode"] == "simulated"
    assert info["configured"] is True
    assert info["real_money"] is False


def test_pay_unconfigured_gateway_rejects(simulated_pay, monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "wechat")  # 无商户配置
    info = opc_pay.info()
    assert info["configured"] is False
    with pytest.raises(opc_pay.PayNotConfigured):
        opc_pay.create_payment({"id": "o1", "amount_cents": 100})


def test_pay_callback_verification(monkeypatch):
    payload = {"out_trade_no": "ord_1", "transaction_id": "tx_1", "sign": "DEADBEEF"}
    ok, _, _, reason = opc_pay.verify_callback("wechat", payload)
    assert not ok and "签名" in reason
    ok, txn, order_id, _ = opc_pay.verify_callback("local-sandbox", {"txn_id": "t", "order_id": "o"})
    assert ok and txn == "t" and order_id == "o"


# ------------------------------------------------------------------ orders lifecycle


def test_place_order_rejects_when_pay_off(opc_db, monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "wechat")
    with pytest.raises(OrderError) as exc_info:
        opc_orders.place_order("svc_content", requirement="写一篇文案")
    assert exc_info.value.status == 503


def test_place_order_validation(opc_db, simulated_pay):
    with pytest.raises(OrderError) as e404:
        opc_orders.place_order("svc_nope", requirement="写一篇文案")
    assert e404.value.status == 404
    with pytest.raises(OrderError) as e422:
        opc_orders.place_order("svc_content", requirement="短")
    assert e422.value.status == 422


def test_order_full_lifecycle_delivered(opc_db, simulated_pay):
    result = opc_orders.place_order(
        "svc_content", buyer_name="测试买家", requirement="给养生茶写小红书种草文案"
    )
    order = result["order"]
    assert order["status"] == "pending_payment"
    assert result["payment"]["provider"] == "local-sandbox"

    paid = opc_orders.mark_paid(order["id"], txn_id=result["payment"]["txn_id"], channel="test")
    assert paid["order"]["status"] == "running"
    assert paid["idempotent"] is False
    # 幂等：重复回调直接短路
    again = opc_orders.mark_paid(order["id"])
    assert again["idempotent"] is True

    # 后台线程推进（live 测试替身秒级）；最多等 30s
    import time

    deadline = time.time() + 30
    final = paid["order"]
    while time.time() < deadline:
        final = opc_orders.sync_order(order["id"])
        if final["status"] in ("delivered", "failed"):
            break
        time.sleep(0.5)
    assert final["status"] == "delivered", f"期望 delivered，实际 {final['status']}"
    _drain_background(order["id"])

    deliverable = json.loads(final["deliverable_json"])
    assert deliverable["evidence"]["events"] == 9  # PLAYBOOK 9 任务
    assert deliverable["cost_cents"] > 0

    # 交付即确认收入：账本记一笔订单收入
    co = opc_company.list_companies()[0]
    ledger = opc_company.ledger_entries(co["id"])
    income = [l for l in ledger if l["kind"] == "income"]
    assert income and income[0]["amount_cents"] == 2900

    # 已交付不可取消
    with pytest.raises(OrderError) as e409:
        opc_orders.cancel_order(order["id"])
    assert e409.value.status == 409


def test_cancel_unpaid_order(opc_db, simulated_pay):
    result = opc_orders.place_order("svc_compliance", requirement="合规预检测试")
    cancelled = opc_orders.cancel_order(result["order"]["id"])
    assert cancelled["status"] == "cancelled"


def _drain_background(order_id: str, timeout: float = 30.0) -> None:
    """等 mark_paid 拉起的后台推进线程把项目跑到终态（live 测试替身秒级）。

    不等的话守护线程会在 monkeypatch undo 后继续跑：_DB_PATH 回滚 +
    _CONN 被重置 → 重连到 conftest root / 真实 dev .shadowflow/opc.sqlite
    （4KB 空库泄漏）。项目到终态即线程自然退出。
    """
    import time

    order = opc_store.get_order(order_id)
    project_id = (order or {}).get("project_id")
    if not project_id:
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        project = opc_company.get_project(project_id)
        if not project or project["status"] in ("delivered", "failed", "cancelled"):
            return
        time.sleep(0.5)


def test_cancel_paid_order_becomes_refunded(opc_db, simulated_pay):
    result = opc_orders.place_order("svc_compliance", requirement="合规预检测试")
    oid = result["order"]["id"]
    opc_orders.mark_paid(oid, txn_id="sim_z")
    refunded = opc_orders.cancel_order(oid, reason="buyer_cancelled")
    assert refunded["status"] == "refunded"
    _drain_background(oid)


# ------------------------------------------------------------------ company ops


def test_hire_fire_and_dashboard(opc_db):
    co = opc_company.list_companies()[0]
    emp = opc_company.hire(co["id"], "测试员", "copywriter", title="文案", model_name="gpt-4o")
    assert emp["status"] == "idle"
    with pytest.raises(opc_company.CompanyError):
        opc_company.hire(co["id"], "坏员工", "writer", model_name="no-such-model")

    # 无未完成任务可直接 fire（返回 {ok, reassigned}；员工状态转 offline）
    fired = opc_company.fire(emp["id"])
    assert fired["ok"] is True and fired["reassigned"] == 0
    assert opc_company.get_employee(emp["id"])["status"] == "offline"

    dash = opc_company.dashboard(co["id"])
    assert dash["company"]["id"] == co["id"]


def test_project_plan_and_approval_gate(opc_db):
    co = opc_company.list_companies()[0]
    project = opc_company.create_project(co["id"], "内部目标", "提升复购率到 20%")
    tasks = opc_company.plan_project(project["id"], opc_seed.PLAYBOOK)
    assert len(tasks) == 9
    # 依赖图：plan 的 after=[plan] 未完成 → research 不可运行
    runnable = {t["key"] for t in opc_company.next_runnable(project["id"])} if tasks and "key" in tasks[0] else None
    if runnable is not None:
        assert "plan" in runnable and "research" not in runnable


def test_project_delete_cascade_and_order_guard(opc_db):
    co = opc_company.list_companies()[0]
    project = opc_company.create_project(co["id"], "待删除内部项目", "验证项目删除事务")
    opc_company.plan_project(project["id"], opc_seed.PLAYBOOK)
    deleted = opc_company.delete_project(project["id"])
    assert deleted["opc_projects"] == 1
    assert deleted["tasks"] == 9
    assert opc_company.get_project(project["id"]) is None
    assert opc_company.list_tasks(project_id=project["id"]) == []

    linked = opc_company.create_project(co["id"], "订单项目", "验证订单删除边界", order_id="ord_linked")
    with pytest.raises(opc_company.CompanyError) as conflict:
        opc_company.delete_project(linked["id"])
    assert conflict.value.status == 409


def test_failed_task_can_retry_without_repeating_done(opc_db, monkeypatch):
    co = opc_company.list_companies()[0]
    project = opc_company.create_project(co["id"], "失败重试项目", "验证失败任务重试")
    tasks = opc_company.plan_project(project["id"], opc_seed.PLAYBOOK)
    monkeypatch.setattr(
        opc_company,
        "_llm_complete",
        lambda system, user, meta: {"text": "[error] 模拟模型失败", "mode": "error"},
    )
    failed = opc_company.run_task(tasks[0]["id"])
    assert failed["task"]["status"] == "failed"
    assert opc_company.get_project(project["id"])["status"] == "failed"

    opc_store.x("UPDATE tasks SET status = 'done' WHERE id = ?", (tasks[1]["id"],))
    monkeypatch.setattr(opc_company, "run_ready", lambda project_id, workers=3: [])
    opc_company.run_project(project["id"], retry=True)
    assert opc_company.get_task(tasks[0]["id"])["status"] == "todo"
    assert opc_company.get_task(tasks[1]["id"])["status"] == "done"


# ------------------------------------------------------------------ HTTP API


@pytest.fixture()
def client(opc_db, simulated_pay):
    from shadowflow.server import app

    with TestClient(app) as c:
        response = c.post(
            "/api/opc/auth/register",
            json={
                "email": "opc-api@example.test",
                "password": "password123",
                "display_name": "老板",
                "company_name": "增长工场 Growth Studio",
            },
        )
        assert response.status_code == 200
        c.headers.update({"Authorization": f"Bearer {response.json()['token']}"})
        yield c


def test_api_opc_surface(client):
    r = client.get("/api/opc/company")
    assert r.status_code == 200
    assert r.json()["company"]["name"] == "增长工场 Growth Studio"

    r = client.get("/api/opc/products")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3

    r = client.get("/api/opc/models")
    assert [m["id"] for m in r.json()["items"]] == list(opc_company.MODEL_CATALOG)


def test_api_employee_update_and_hire_manager(client):
    company_id = client.get("/api/opc/company").json()["company"]["id"]
    manager = client.get(f"/api/opc/company/{company_id}/roster").json()["items"][0]
    department = client.post(
        f"/api/opc/company/{company_id}/departments",
        json={"name": "新岗位部门", "charter": "初始职责"},
    ).json()["department"]

    response = client.post(
        f"/api/opc/company/{company_id}/employees",
        json={
            "name": "可配置岗位",
            "role": "writer",
            "title": "内容专员",
            "department_id": department["id"],
            "manager_id": manager["id"],
            "system_prompt": "初始提示词",
            "model_name": "gpt-4o",
        },
    )
    assert response.status_code == 200
    employee = response.json()["employee"]
    assert employee["manager_id"] == manager["id"]

    response = client.patch(
        f"/api/opc/company/{company_id}/employees/{employee['id']}",
        json={
            "name": "更新后的员工",
            "title": "高级内容专员",
            "department_id": None,
            "manager_id": None,
            "system_prompt": "更新后的提示词",
            "avatar": "新头像",
            "status": "blocked",
            "model_name": "deepseek-chat",
        },
    )
    assert response.status_code == 200
    updated = response.json()["employee"]
    assert updated["name"] == "更新后的员工"
    assert updated["title"] == "高级内容专员"
    assert updated["department_id"] is None
    assert updated["manager_id"] is None
    assert updated["system_prompt"] == "更新后的提示词"
    assert updated["avatar"] == "新头像"
    assert updated["status"] == "blocked"
    assert updated["model_name"] == "deepseek-chat"
    assert updated["model_provider"] == "DeepSeek"

    persisted = client.get(
        f"/api/opc/company/{company_id}/employees/{employee['id']}"
    ).json()["employee"]
    assert persisted == updated


def test_api_fire_rejects_employee_from_another_company(client):
    company_id = client.get("/api/opc/company").json()["company"]["id"]
    other_company = opc_company.create_company("另一家公司", "测试", "验证隔离", owner_user_id="other-user")
    other_employee = opc_company.hire(other_company["id"], "其他公司员工", "writer")

    response = client.post(
        f"/api/opc/company/{company_id}/employees/{other_employee['id']}/fire",
        json={},
    )
    assert response.status_code == 404
    assert opc_company.get_employee(other_employee["id"])["employment"] == "ai"


def test_api_department_update_delete_and_employee_conflict(client):
    company_id = client.get("/api/opc/company").json()["company"]["id"]
    department = client.post(
        f"/api/opc/company/{company_id}/departments",
        json={"name": "原部门", "charter": "原职责"},
    ).json()["department"]

    response = client.patch(
        f"/api/opc/company/{company_id}/departments/{department['id']}",
        json={"name": "重命名部门", "charter": "新职责"},
    )
    assert response.status_code == 200
    assert response.json()["department"]["name"] == "重命名部门"
    assert response.json()["department"]["charter"] == "新职责"

    employee = client.post(
        f"/api/opc/company/{company_id}/employees",
        json={"name": "部门员工", "department_id": department["id"]},
    ).json()["employee"]
    response = client.delete(f"/api/opc/company/{company_id}/departments/{department['id']}")
    assert response.status_code == 409
    assert "1 名员工" in response.json()["detail"]

    response = client.patch(
        f"/api/opc/company/{company_id}/employees/{employee['id']}",
        json={"department_id": None},
    )
    assert response.status_code == 200
    response = client.delete(f"/api/opc/company/{company_id}/departments/{department['id']}")
    assert response.status_code == 204
    assert opc_company.get_department(company_id, department["id"]) is None


def test_api_order_create_pay_notify_cancel(client):
    r = client.post(
        "/api/opc/orders",
        json={"product_id": "svc_content", "buyer_name": "API 买家", "requirement": "写一篇种草文案"},
    )
    assert r.status_code == 200
    order = r.json()["order"]
    assert order["status"] == "pending_payment"
    assert r.json()["payment"]["txn_id"].startswith("sim_")

    # 沙箱回调必须匹配下单交易号，不能伪造支付成功。
    forged = client.post(
        "/api/opc/pay/notify",
        json={"provider": "local-sandbox", "txn_id": "sim_forged", "order_id": order["id"]},
    )
    assert forged.status_code == 400
    assert opc_store.get_order(order["id"])["status"] == "pending_payment"
    r = client.post(
        "/api/opc/pay/notify",
        json={"provider": "local-sandbox", "txn_id": r.json()["payment"]["txn_id"], "order_id": order["id"]},
    )
    assert r.status_code == 200
    assert r.json()["idempotent"] is False

    # 等后台推进线程跑完（防泄漏到真实 .shadowflow/，见 _drain_background 注释）
    _drain_background(order["id"])

    r = client.get(f"/api/opc/orders/{order['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["order"]["status"] in ("running", "delivered")
    assert len(body["steps"]) == 9
    assert body["project"]["status"] in ("executing", "delivered")

    # 未付款订单取消
    r = client.post("/api/opc/orders", json={"product_id": "svc_compliance", "requirement": "合规快检"})
    oid = r.json()["order"]["id"]
    r = client.post(f"/api/opc/orders/{oid}/cancel", json={"reason": "test"})
    assert r.json()["order"]["status"] == "cancelled"

    # 回调验签失败 → 400
    r = client.post("/api/opc/pay/notify", json={"provider": "wechat", "sign": "bad"})
    assert r.status_code == 400


def test_api_orders_products_events_and_notify_are_company_scoped(client):
    own_company = client.get("/api/opc/company").json()["company"]
    own_products = client.get("/api/opc/products").json()["items"]
    created = client.post(
        "/api/opc/orders",
        json={"product_id": own_products[0]["id"], "requirement": "验证跨公司订单隔离"},
    )
    assert created.status_code == 200
    order = created.json()["order"]
    payment = created.json()["payment"]
    assert order["company_id"] == own_company["id"]

    other = TestClient(client.app)
    registered = other.post(
        "/api/opc/auth/register",
        json={
            "email": "other-order-owner@example.test", "password": "password123",
            "display_name": "另一老板", "company_name": "另一订单公司",
        },
    )
    assert registered.status_code == 200
    other.headers.update({"Authorization": f"Bearer {registered.json()['token']}"})
    other_company = registered.json()["company"]
    assert other_company["id"] != own_company["id"]
    other_products = other.get("/api/opc/products").json()["items"]
    assert other_products
    assert {p["company_id"] for p in other_products} == {other_company["id"]}
    assert not ({p["id"] for p in other_products} & {p["id"] for p in own_products})

    assert other.get("/api/opc/orders").json()["items"] == []
    for method, path in (
        ("get", f"/api/opc/orders/{order['id']}"),
        ("get", f"/api/opc/orders/{order['id']}/events"),
        ("post", f"/api/opc/orders/{order['id']}/cancel"),
        ("get", f"/api/opc/products/{own_products[0]['id']}"),
    ):
        response = getattr(other, method)(path, json={}) if method == "post" else getattr(other, method)(path)
        assert response.status_code == 404, (path, response.text)
    notify = other.post(
        "/api/opc/pay/notify",
        json={"provider": "local-sandbox", "txn_id": payment["txn_id"], "order_id": order["id"]},
    )
    assert notify.status_code == 404
    assert opc_store.get_order(order["id"])["status"] == "pending_payment"
    assert client.post(f"/api/opc/orders/{order['id']}/cancel", json={}).status_code == 200
