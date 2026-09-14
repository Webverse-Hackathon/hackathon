export function DiffView({ diff, label }: { diff: string; label: string }) {
  const lines = diff.split('\n');
  return (
    <div className="diff" role="region" aria-label={label}>
      <pre>
        <code>
          {lines.map((line, index) => {
            const kind = line.startsWith('+++') || line.startsWith('---') ? 'file' : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
            const prefix = kind === 'add' ? 'added: ' : kind === 'del' ? 'removed: ' : '';
            return (
              <span key={index} className={`diff-line diff-${kind}`}>
                {prefix ? <span className="sr-only">{prefix}</span> : null}
                {line || ' '}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
