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

interface TestResult {
    status: string;
    environment?: {
        spreadsheetId: string;
        clientEmail: string;
        privateKey: string;
    };
    authentication?: string;
    sheetAccess?: string;
    sheetTitle?: string;
    availableSheets?: string[];
    error?: string;
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
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    // イベント読み込み
    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        setIsLoading(true);
        try {
            // スプレッドシートからデータを取得
            const response = await fetch('/api/sheets/schedule');
            const data = await response.json();

            if (response.ok && data.events && data.events.length > 0) {
                // スプレッドシートのデータを使用
                const parsed: StoredEvent[] = data.events.map((ev: Record<string, string>) => ({
                    id: ev.id,
                    date: ev.date,
                    startTime: ev.startTime,
                    endTime: ev.endTime,
                    courtNumber: parseInt(ev.courtNumber, 10) || 1,
                }));
                const sorted = parsed.sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                setEvents(sorted);
                // ローカルストレージにキャッシュ
                localStorage.setItem('tennis_events', JSON.stringify(sorted));
            } else {
                // フォールバック: ローカルストレージから読み込み
                const stored = localStorage.getItem('tennis_events');
                if (stored) {
                    const parsed: StoredEvent[] = JSON.parse(stored);
                    const sorted = parsed.sort((a, b) =>
                        new Date(a.date).getTime() - new Date(b.date).getTime()
                    );
                    setEvents(sorted);
                }
            }
        } catch (error) {
            console.error('Failed to load from spreadsheet:', error);
            // エラー時: ローカルストレージから読み込み
            const stored = localStorage.getItem('tennis_events');
            if (stored) {
                const parsed: StoredEvent[] = JSON.parse(stored);
                const sorted = parsed.sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                setEvents(sorted);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const saveEvents = (newEvents: StoredEvent[]) => {
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

        const eventId = editingId || `event_${formData.date}_${Date.now()}`;

        try {
            // Google Sheetsに保存を試みる
            const sheetsResponse = await fetch('/api/sheets/schedule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: eventId,
                    ...formData,
                }),
            });

            const sheetsData = await sheetsResponse.json();
            console.log('Sheets API response:', sheetsData);

            if (!sheetsResponse.ok) {
                console.error('Sheets API error:', sheetsData);
                // エラーをユーザーに表示するが、ローカル保存は続行
                setMessage({
                    type: 'error',
                    text: `⚠️ スプレッドシート保存エラー: ${sheetsData.message || sheetsData.error || 'Unknown error'}`,
                });
            } else {
                setMessage({ type: 'success', text: '✅ 開催日を登録しました！（スプレッドシートにも保存済み）' });
            }

            // ローカルストレージにも保存
            if (editingId) {
                const updated = events.map(ev =>
                    ev.id === editingId ? { ...formData, id: editingId } : ev
                );
                saveEvents(updated);
            } else {
                const newEvent: StoredEvent = {
                    id: eventId,
                    ...formData,
                };
                saveEvents([...events, newEvent]);
            }

            setEditingId(null);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                startTime: '09:00',
                endTime: '12:00',
                courtNumber: 1,
            });

        } catch (error) {
            console.error('Submit error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessage({
                type: 'error',
                text: `❌ エラー: ${errorMessage}`,
            });
            // ネットワークエラーの場合、ユーザーに警告
            alert(`保存処理中にエラーが発生しました:\n${errorMessage}\n\nローカルには保存されていない可能性があります。`);
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = (eventId: string) => {
        if (confirm('この開催日を削除しますか？')) {
            const filtered = events.filter(ev => ev.id !== eventId);
            saveEvents(filtered);

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

    const handleConnectionTest = async () => {
        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/sheets/test', {
                method: 'POST',
            });
            const data = await response.json();
            setTestResult(data);
        } catch (error) {
            setTestResult({
                status: 'NG',
                error: error instanceof Error ? error.message : 'Network error',
            });
        } finally {
            setIsTesting(false);
        }
    };

    // 最大日付を1年後に設定
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const today = new Date().toISOString().split('T')[0];
    const upcomingEvents = events.filter(ev => ev.date >= today);
    const pastEvents = events.filter(ev => ev.date < today);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>📅 開催スケジュール</h1>

            {/* デバッグパネル */}
            <div className={styles.debugSection}>
                <button
                    type="button"
                    className={styles.debugToggle}
                    onClick={() => setShowDebug(!showDebug)}
                >
                    🔧 デバッグ {showDebug ? '▲' : '▼'}
                </button>

                {showDebug && (
                    <div className={styles.debugPanel}>
                        <button
                            type="button"
                            className={styles.testBtn}
                            onClick={handleConnectionTest}
                            disabled={isTesting}
                        >
                            {isTesting ? '接続中...' : '📊 スプレッドシート接続テスト'}
                        </button>

                        {testResult && (
                            <div className={`${styles.testResult} ${testResult.status === 'OK' ? styles.testOk : styles.testNg}`}>
                                <div className={styles.testStatus}>
                                    ステータス: <strong>{testResult.status}</strong>
                                </div>
                                {testResult.environment && (
                                    <div className={styles.testDetails}>
                                        <div>Spreadsheet ID: {testResult.environment.spreadsheetId}</div>
                                        <div>Client Email: {testResult.environment.clientEmail}</div>
                                        <div>Private Key: {testResult.environment.privateKey}</div>
                                    </div>
                                )}
                                {testResult.authentication && (
                                    <div>認証: {testResult.authentication}</div>
                                )}
                                {testResult.sheetAccess && (
                                    <div>シートアクセス: {testResult.sheetAccess}</div>
                                )}
                                {testResult.availableSheets && (
                                    <div>利用可能なシート: {testResult.availableSheets.join(', ')}</div>
                                )}
                                {testResult.error && (
                                    <div className={styles.testError}>エラー: {testResult.error}</div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

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
                        min={editingId ? undefined : new Date().toISOString().split('T')[0]}
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
