'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';

const navItems = [
    { href: '/', label: 'ホーム', icon: '🏠' },
    { href: '/schedule', label: 'スケジュール', icon: '📅' },
    { href: '/attendance', label: '出欠', icon: '✋' },
    { href: '/matches', label: '試合', icon: '🎾' },
    { href: '/rankings', label: 'ランキング', icon: '🏆' },
];

export default function Header() {
    const pathname = usePathname();

    return (
        <header className={styles.header}>
            <div className={styles.container}>
                <Link href="/" className={styles.logo}>
                    <span className={styles.logoIcon}>🎾</span>
                    <span className={styles.logoText}>テニスクラブ</span>
                </Link>
            </div>

            <nav className={styles.bottomNav}>
                {navItems.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                    >
                        <span className={styles.navIcon}>{item.icon}</span>
                        <span className={styles.navLabel}>{item.label}</span>
                    </Link>
                ))}
            </nav>
        </header>
    );
}
