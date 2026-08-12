import styles from "./page.module.css";

// Next.js wraps the page in a Suspense boundary automatically when a
// sibling loading.tsx exists, and renders this in the meantime. That gives
// skeleton rows "for free" without hand-rolled client-side loading state —
// this file is never imported directly, Next wires it up by file convention.
export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Sessions</h1>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Conversation ID</th>
              <th>Status</th>
              <th>Perception</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 3 }).map((__, j) => (
                  <td key={j}>
                    <div className={styles.skeletonCell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
