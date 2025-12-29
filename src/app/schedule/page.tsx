'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

interface EventForm {
    date: string;
    startTime: string;
    endTime: string;
    courtNumber: number;
}

interface StoredEvent extends EventForm {
    id: string;
}

export default function SchedulePage() {
    const [formData, setFormData] = useState<EventForm>({
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '12:00',
        courtNumber: 1,
    });
    const [events, setEvents] = useState<StoredEvent[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // イベント読み込み
    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = () => {
        const stored = localStorage.getItem('tennis_events');
        if (stored) {
            const parsed: StoredEvent[] = JSON.parse(stored);
            // 日付が近い順にソート
            const sorted = parsed.sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            setEvents(sorted);
        }
    };

    const saveEvents = (newEvents: StoredEvent[]) => {
        // 日付が近い順にソート
        const sorted = newEvents.sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        localStorage.setItem('tennis_events', JSON.stringify(sorted));
        setEvents(sorted);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        try {
            if (editingId) {
                // 編集モード
                const updated = events.map(ev =>
                    ev.id === editingId ? { ...formData, id: editingId } : ev
                );
                saveEvents(updated);
                setMessage({ type: 'success', text: '開催日を更新しました！' });
                setEditingId(null);
            } else {
                // 新規登録
                const eventId = `event_${formData.date}_${Date.now()}`;
                const newEvent: StoredEvent = {
                    id: eventId,
                    ...formData,
                };
                saveEvents([...events, newEvent]);
                setMessage({ type: 'success', text: '開催日を登録しました！' });
            }

            // フォームリセット
            setFormData({
                date: new Date().toISOString().split('T')[0],
                startTime: '09:00',
                endTime: '12:00',
                courtNumber: 1,
            });
        } catch {
            setMessage({ type: 'error', text: 'エラーが発生しました' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (event: StoredEvent) => {
        setFormData({
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            courtNumber: event.courtNumber,
        });
        setEditingId(event.id);
        setMessage(null);
        // フォームへスクロール
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (eventId: string) => {
        if (confirm('この開催日を削除しますか？')) {
            const filtered = events.filter(ev => ev.id !== eventId);
            saveEvents(filtered);

            // 現在のイベントが削除されたらクリア
            const currentEvent = localStorage.getItem('current_event');
            if (currentEvent) {
                const parsed = JSON.parse(currentEvent);
                if (parsed.id === eventId) {
                    localStorage.removeItem('current_event');
                }
            }

            setMessage({ type: 'success', text: '開催日を削除しました' });
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            startTime: '09:00',
            endTime: '12:00',
            courtNumber: 1,
        });
        setMessage(null);
    };

    // 2ヶ月先までの日付を計算
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 2);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    // 今日以降の開催日と過去の開催日を分ける
    const today = new Date().toISOString().split('T')[0];
    const upcomingEvents = events.filter(ev => ev.date >= today);
    const pastEvents = events.filter(ev => ev.date < today);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>📅 開催スケジュール</h1>

            <form onSubmit={handleSubmit} className={styles.form}>
                {editingId && (
                    <div className={styles.editingBanner}>
                        ✏️ 編集中
                    </div>
                )}

                <div className={styles.formGroup}>
                    <label className={styles.label}>開催日</label>
                    <input
                        type="date"
                        className={styles.input}
                        value={formData.date}
                        min={new Date().toISOString().split('T')[0]}
                        max={maxDateStr}
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

                <div className={styles.formButtons}>
                    {editingId && (
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={handleCancel}
                        >
                            キャンセル
                        </button>
                    )}
                    <button
                        type="submit"
                        className={styles.submitBtn}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? '処理中...' : editingId ? '更新する' : '登録する'}
                    </button>
                </div>
            </form>

            {/* 今後の開催一覧 */}
            {upcomingEvents.length > 0 && (
                <section className={styles.eventSection}>
                    <h2 className={styles.sectionTitle}>📆 今後の開催 ({upcomingEvents.length}件)</h2>
                    <div className={styles.eventList}>
                        {upcomingEvents.map((event) => (
                            <div key={event.id} className={styles.eventCard}>
                                <div className={styles.eventMain}>
                                    <div className={styles.eventDate}>{formatDate(event.date)}</div>
                                    <div className={styles.eventDetails}>
                                        <span>🕐 {event.startTime} 〜 {event.endTime}</span>
                                        <span>🎾 コート {event.courtNumber}</span>
                                    </div>
                                </div>
                                <div className={styles.eventActions}>
                                    <button
                                        className={styles.editBtn}
                                        onClick={() => handleEdit(event)}
                                        title="編集"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={() => handleDelete(event.id)}
                                        title="削除"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* 過去の開催一覧 */}
            {pastEvents.length > 0 && (
                <section className={styles.eventSection}>
                    <h2 className={styles.sectionTitle}>📁 過去の開催 ({pastEvents.length}件)</h2>
                    <div className={styles.eventList}>
                        {pastEvents.slice().reverse().map((event) => (
                            <div key={event.id} className={`${styles.eventCard} ${styles.past}`}>
                                <div className={styles.eventMain}>
                                    <div className={styles.eventDate}>{formatDate(event.date)}</div>
                                    <div className={styles.eventDetails}>
                                        <span>🕐 {event.startTime} 〜 {event.endTime}</span>
                                        <span>🎾 コート {event.courtNumber}</span>
                                    </div>
                                </div>
                                <div className={styles.eventActions}>
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={() => handleDelete(event.id)}
                                        title="削除"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {events.length === 0 && (
                <div className={styles.emptyState}>
                    <p>登録済みの開催はありません</p>
                    <p className={styles.hint}>上のフォームから開催日を登録してください</p>
                </div>
            )}
        </div>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDay = weekDays[date.getDay()];
    return `${month}/${day}(${weekDay})`;
}
