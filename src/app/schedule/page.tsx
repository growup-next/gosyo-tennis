'use client';

import { useState } from 'react';
import styles from './page.module.css';

interface EventForm {
    date: string;
    startTime: string;
    endTime: string;
    courtNumber: number;
}

export default function SchedulePage() {
    const [formData, setFormData] = useState<EventForm>({
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '12:00',
        courtNumber: 1,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        try {
            // ローカルストレージに保存（Google Sheets 連携前の仮実装）
            const eventId = `event_${formData.date}_${Date.now()}`;
            const event = {
                id: eventId,
                ...formData,
            };

            const existingEvents = JSON.parse(localStorage.getItem('tennis_events') || '[]');
            existingEvents.push(event);
            localStorage.setItem('tennis_events', JSON.stringify(existingEvents));

            // 現在のイベントとして設定
            localStorage.setItem('current_event', JSON.stringify(event));

            setMessage({ type: 'success', text: '開催を登録しました！' });
        } catch {
            setMessage({ type: 'error', text: 'エラーが発生しました' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>📅 開催スケジュール</h1>

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label className={styles.label}>開催日</label>
                    <input
                        type="date"
                        className={styles.input}
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                </div>

                <div className={styles.timeRow}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>開始時間</label>
                        <input
                            type="time"
                            className={styles.input}
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>終了時間</label>
                        <input
                            type="time"
                            className={styles.input}
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                            required
                        />
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>コート番号</label>
                    <div className={styles.courtGrid}>
                        {[1, 2, 3, 4, 5].map((num) => (
                            <button
                                key={num}
                                type="button"
                                className={`${styles.courtBtn} ${formData.courtNumber === num ? styles.active : ''}`}
                                onClick={() => setFormData({ ...formData, courtNumber: num })}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {message && (
                    <div className={`${styles.message} ${styles[message.type]}`}>
                        {message.text}
                    </div>
                )}

                <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? '登録中...' : '開催を登録'}
                </button>
            </form>

            {/* 登録済み開催一覧 */}
            <EventList />
        </div>
    );
}

function EventList() {
    const [events, setEvents] = useState<Array<{
        id: string;
        date: string;
        startTime: string;
        endTime: string;
        courtNumber: number;
    }>>([]);

    // クライアントサイドでのみ実行
    useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('tennis_events');
            if (stored) {
                setEvents(JSON.parse(stored));
            }
        }
    });

    if (events.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>登録済みの開催はありません</p>
            </div>
        );
    }

    return (
        <section className={styles.eventList}>
            <h2 className={styles.sectionTitle}>登録済み開催</h2>
            {events.slice().reverse().map((event) => (
                <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventDate}>{formatDate(event.date)}</div>
                    <div className={styles.eventDetails}>
                        <span>🕐 {event.startTime} 〜 {event.endTime}</span>
                        <span>🎾 コート {event.courtNumber}</span>
                    </div>
                </div>
            ))}
        </section>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}/${date.getDate()}(${weekDays[date.getDay()]})`;
}
