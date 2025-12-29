import styles from './page.module.css';
import Link from 'next/link';

export default function Home() {
  return (
    <div className={styles.container}>
      {/* ヒーローセクション */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroIcon}>🎾</span>
            テニスクラブ
          </h1>
          <p className={styles.heroSubtitle}>
            試合管理・ランキングシステム
          </p>
        </div>
      </section>

      {/* クイックアクション */}
      <section className={styles.quickActions}>
        <h2 className={styles.sectionTitle}>クイックアクション</h2>
        <div className={styles.actionGrid}>
          <Link href="/schedule" className={styles.actionCard}>
            <span className={styles.actionIcon}>📅</span>
            <span className={styles.actionLabel}>開催登録</span>
            <span className={styles.actionDesc}>新しい開催日を登録</span>
          </Link>

          <Link href="/attendance" className={styles.actionCard}>
            <span className={styles.actionIcon}>✋</span>
            <span className={styles.actionLabel}>出欠登録</span>
            <span className={styles.actionDesc}>参加者を登録</span>
          </Link>

          <Link href="/matches" className={styles.actionCard}>
            <span className={styles.actionIcon}>🎾</span>
            <span className={styles.actionLabel}>試合開始</span>
            <span className={styles.actionDesc}>組み合わせ生成</span>
          </Link>

          <Link href="/rankings" className={styles.actionCard}>
            <span className={styles.actionIcon}>🏆</span>
            <span className={styles.actionLabel}>ランキング</span>
            <span className={styles.actionDesc}>成績を確認</span>
          </Link>
        </div>
      </section>

      {/* メンバー一覧 */}
      <section className={styles.membersSection}>
        <h2 className={styles.sectionTitle}>固定メンバー</h2>
        <div className={styles.memberGrid}>
          {['足立', '今宮', '小島', '末森', '鈴鹿', '田中', '土田', '豊福', '西沢', '橋本', '宮城', '岩田'].map(name => (
            <div key={name} className={styles.memberChip}>
              {name}
            </div>
          ))}
        </div>
        <p className={styles.guestNote}>
          ※ ゲストは当日追加可能（ランキング対象外）
        </p>
      </section>

      {/* ルール説明 */}
      <section className={styles.rulesSection}>
        <h2 className={styles.sectionTitle}>試合ルール</h2>
        <div className={styles.rulesList}>
          <div className={styles.ruleItem}>
            <span className={styles.ruleIcon}>🎯</span>
            <div>
              <strong>4ゲーム先取</strong>
              <p>1セット制（ショートゲーム）</p>
            </div>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.ruleIcon}>⚡</span>
            <div>
              <strong>デュースルール</strong>
              <p>6名以上：ノーアド / 6名以下：1デュース</p>
            </div>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.ruleIcon}>🎲</span>
            <div>
              <strong>コイントス</strong>
              <p>勝者がサーブ/レシーブ選択</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
