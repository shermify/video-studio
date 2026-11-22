import { DraftBuilder } from '@/components/studio/DraftBuilder';
import { Preview } from '@/components/studio/Preview';
import { Queue } from '@/components/studio/Queue';

export const App = () => {
  return (
    <div className="h-screen flex">
      {/* Left pane: Draft Builder */}
      <aside className="w-80 border-r shrink-0 overflow-auto">
        <DraftBuilder />
      </aside>

      {/* Center pane: Preview */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Preview />
      </main>

      {/* Right pane: Queue */}
      <aside className="w-96 border-l shrink-0 overflow-hidden flex flex-col">
        <Queue />
      </aside>
    </div>
  );
};
