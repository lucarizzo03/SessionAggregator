import styles from "./page.module.css";

function Bar({ width, height = 14 }: { width: string; height?: number }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: 4,
        background: "var(--border)",
        animation: "pulse 1.4s ease-in-out infinite",
        marginBottom: 10,
      }}
    />
  );
}

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Aggregate</h1>
        </div>
      </div>

      <div className={styles.statRow}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.stat}>
            <Bar width="100px" height={11} />
            <Bar width="60px" height={40} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <Bar width="180px" />
        <div className={styles.listWrap}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: "16px 20px" }}>
              <Bar width="70%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
