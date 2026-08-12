import styles from "./page.module.css";

function Bar({ width }: { width: string }) {
  return (
    <div
      style={{
        height: 14,
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
      <div className={styles.back}>← Sessions</div>
      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <Bar width="280px" />
      </div>
      <div className={styles.meta}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.metaItem}>
            <Bar width="80px" />
          </div>
        ))}
      </div>
      <div className={styles.columns}>
        <div className={styles.column}>
          <Bar width="120px" />
          <Bar width="100%" />
          <Bar width="90%" />
          <Bar width="70%" />
        </div>
        <div className={styles.column}>
          <Bar width="140px" />
          <Bar width="100%" />
          <Bar width="90%" />
          <Bar width="70%" />
        </div>
      </div>
    </div>
  );
}
