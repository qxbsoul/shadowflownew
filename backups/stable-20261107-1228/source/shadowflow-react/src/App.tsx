import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import WorkbenchView from './components/WorkbenchView';
import OrgView from './components/OrgView';
import TasksView from './components/TasksView';
import DeliverablesView from './components/DeliverablesView';
import DashboardView from './components/DashboardView';
import KnowledgeView from './components/KnowledgeView';
import ModalHost from './components/ModalHost';
import Toasts from './components/Toasts';
import { WorkbenchContext, useWorkbenchStore } from './store';

export default function App() {
  const store = useWorkbenchStore();

  return (
    <WorkbenchContext.Provider value={store}>
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar />
          <div className="views">
            <section className={store.view === 'workbench' ? 'view active' : 'view'}>
              <WorkbenchView />
            </section>
            <section className={store.view === 'org' ? 'view active' : 'view'}>
              <OrgView />
            </section>
            <section className={store.view === 'tasks' ? 'view active' : 'view'}>
              <TasksView />
            </section>
            <section className={store.view === 'deliverables' ? 'view active' : 'view'}>
              <DeliverablesView />
            </section>
            <section className={store.view === 'dashboard' ? 'view active' : 'view'}>
              <DashboardView />
            </section>
            <section className={store.view === 'knowledge' ? 'view active' : 'view'}>
              <KnowledgeView />
            </section>
          </div>
        </div>
      </div>
      <ModalHost />
      <Toasts />
    </WorkbenchContext.Provider>
  );
}
