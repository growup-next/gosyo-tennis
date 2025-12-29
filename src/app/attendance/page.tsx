'use client';

import { useState, useEffect } from 'react';
import { FIXED_MEMBERS, createGuest } from '@/data/members';
import { Member, AttendanceStatus, Attendance } from '@/types';
import styles from './page.module.css';

interface StoredEvent {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    courtNumber: number;
}

interface AttendanceEntry extends Member {
    status: AttendanceStatus;
    earlyLeave: boolean;
    earlyLeaveTime: string;
}

export default function AttendancePage() {
    const [events, setEvents] = useState<StoredEvent[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [attendances, setAttendances] = useState<AttendanceEntry[]>([]);
    const [guestName, setGuestName] = useState('');

    // イベント読み込み
    useEffect(() => {
        loadEvents();
    }, []);

    // 選択されたイベントが変更されたら出欠を読み込む
    useEffect(() => {
        if (selectedEventId) {
            loadAttendances(selectedEventId);
            // 現在のイベントとして保存
            const event = events.find(e => e.id === selectedEventId);
            if (event) {
                localStorage.setItem('current_event', JSON.stringify(event));
            }
        }
    }, [selectedEventId, events]);

    const loadEvents = () => {
        const stored = localStorage.getItem('tennis_events');
        if (stored) {
            const parsed: StoredEvent[] = JSON.parse(stored);
            const today = new Date().toISOString().split('T')[0];
            // 今日以降のイベントのみ、日付順にソート
            const upcoming = parsed
                .filter(ev => ev.date >= today)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setEvents(upcoming);

            // デフォルトで最初のイベントを選択
            if (upcoming.length > 0 && !selectedEventId) {
                setSelectedEventId(upcoming[0].id);
            }
        }
    };

    const loadAttendances = (eventId: string) => {
        // 固定メンバーの出欠初期化
        const initialAttendances: AttendanceEntry[] = FIXED_MEMBERS.map(member => ({
            ...member,
            status: 'undecided' as AttendanceStatus,
            earlyLeave: false,
            earlyLeaveTime: '',
        }));

        // 保存済みの出欠を復元
        const savedStr = localStorage.getItem('tennis_attendances');
        if (savedStr) {
            const saved: Attendance[] = JSON.parse(savedStr);

            initialAttendances.forEach(entry => {
                const savedEntry = saved.find(s => s.eventId === eventId && s.memberId === entry.id);
                if (savedEntry) {
                    entry.status = savedEntry.status;
                    entry.earlyLeave = savedEntry.earlyLeave;
                    entry.earlyLeaveTime = savedEntry.earlyLeaveTime || '';
                }
            });

            // ゲストを追加
            const guestsStr = localStorage.getItem('tennis_guests');
            const guests: Member[] = guestsStr ? JSON.parse(guestsStr) : [];

            saved.filter(s => s.eventId === eventId && s.memberId.startsWith('guest_'))
                .forEach(guestAttendance => {
                    const guest = guests.find(g => g.id === guestAttendance.memberId);
                    if (guest) {
                        initialAttendances.push({
                            ...guest,
                            status: guestAttendance.status,
                            earlyLeave: guestAttendance.earlyLeave,
                            earlyLeaveTime: guestAttendance.earlyLeaveTime || '',
                        });
                    }
                });
        }

        setAttendances(initialAttendances);
    };

    const updateAttendance = (memberId: string, field: keyof AttendanceEntry, value: unknown) => {
        setAttendances(prev => {
            const updated = prev.map(a =>
                a.id === memberId ? { ...a, [field]: value } : a
            );

            // ローカルストレージに保存
            if (selectedEventId) {
                // 既存の全データを取得
                const existingStr = localStorage.getItem('tennis_attendances');
                let allAttendances: Attendance[] = existingStr ? JSON.parse(existingStr) : [];

                // 現在のイベント以外のデータを保持
                allAttendances = allAttendances.filter(a => a.eventId !== selectedEventId);

                // 現在のイベントのデータを追加
                const currentEventAttendances: Attendance[] = updated.map(a => ({
                    eventId: selectedEventId,
                    memberId: a.id,
                    status: a.status,
                    earlyLeave: a.earlyLeave,
                    earlyLeaveTime: a.earlyLeaveTime,
                }));

                localStorage.setItem('tennis_attendances', JSON.stringify([...allAttendances, ...currentEventAttendances]));

                // スプレッドシートにも保存
                const updatedEntry = updated.find(a => a.id === memberId);
                if (updatedEntry) {
                    saveAttendanceToSheet(selectedEventId, updatedEntry);
                }
            }

            return updated;
        });
    };

    const saveAttendanceToSheet = async (eventId: string, entry: AttendanceEntry) => {
        try {
            await fetch('/api/sheets/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sheetName: 'Attendance',
                    data: {
                        eventId: eventId,
                        memberId: entry.id,
                        status: entry.status,
                        earlyLeave: entry.earlyLeave ? 'true' : 'false',
                        earlyLeaveTime: entry.earlyLeaveTime || '',
                        updatedAt: new Date().toISOString(),
                    },
                }),
            });
            console.log('Attendance saved to spreadsheet');
        } catch (error) {
            console.error('Failed to save attendance to spreadsheet:', error);
        }
    };

    const addGuest = () => {
        if (!guestName.trim()) return;

        const guest = createGuest(guestName.trim());
        const guestEntry: AttendanceEntry = {
            ...guest,
            status: 'present',
            earlyLeave: false,
            earlyLeaveTime: '',
        };

        // ゲストリストに追加
        const existingGuests = JSON.parse(localStorage.getItem('tennis_guests') || '[]');
        existingGuests.push(guest);
        localStorage.setItem('tennis_guests', JSON.stringify(existingGuests));

        setAttendances(prev => {
            const updated = [...prev, guestEntry];

            // 出欠も保存
            if (selectedEventId) {
                const existingStr = localStorage.getItem('tennis_attendances');
                const allAttendances: Attendance[] = existingStr ? JSON.parse(existingStr) : [];
                allAttendances.push({
                    eventId: selectedEventId,
                    memberId: guest.id,
                    status: 'present',
                    earlyLeave: false,
                    earlyLeaveTime: '',
                });
                localStorage.setItem('tennis_attendances', JSON.stringify(allAttendances));
            }

            return updated;
        });
        setGuestName('');
    };

    const removeGuest = (guestId: string) => {
        setAttendances(prev => prev.filter(a => a.id !== guestId));

        // ゲストリストからも削除
        const existingGuests = JSON.parse(localStorage.getItem('tennis_guests') || '[]');
        const filtered = existingGuests.filter((g: Member) => g.id !== guestId);
        localStorage.setItem('tennis_guests', JSON.stringify(filtered));

        // 出欠からも削除
        const existingStr = localStorage.getItem('tennis_attendances');
        if (existingStr) {
            const allAttendances: Attendance[] = JSON.parse(existingStr);
            const filteredAttendances = allAttendances.filter(a => a.memberId !== guestId);
            localStorage.setItem('tennis_attendances', JSON.stringify(filteredAttendances));
        }
    };

    const selectedEvent = events.find(e => e.id === selectedEventId);
    const presentCount = attendances.filter(a => a.status === 'present').length;
    const earlyLeavers = attendances.filter(a => a.status === 'present' && a.earlyLeave);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>✋ 出欠登録</h1>

            {/* 開催日選択 */}
            {events.length > 0 ? (
                <div className={styles.eventSelector}>
                    <label className={styles.label}>開催日を選択</label>
                    <select
                        className={styles.eventSelect}
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                    >
                        {events.map(event => (
                            <option key={event.id} value={event.id}>
                                {formatDate(event.date)} {event.startTime}〜 コート{event.courtNumber}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <div className={styles.noEvent}>
                    <p>開催日が登録されていません</p>
                    <a href="/schedule" className={styles.link}>開催日を登録する →</a>
                </div>
            )}

            {selectedEvent && (
                <>
                    {/* 選択中の開催情報 */}
                    <div className={styles.eventInfo}>
                        <span className={styles.eventDate}>📅 {formatDateFull(selectedEvent.date)}</span>
                        <span className={styles.eventTime}>🕐 {selectedEvent.startTime} 〜 {selectedEvent.endTime}</span>
                        <span className={styles.eventCourt}>🎾 コート {selectedEvent.courtNumber}</span>
                    </div>

                    {/* 出席カウント */}
                    <div className={styles.countBar}>
                        <span className={styles.countLabel}>出席者</span>
                        <span className={styles.countValue}>{presentCount}名</span>
                        {earlyLeavers.length > 0 && (
                            <span className={styles.countNote}>（早退予定: {earlyLeavers.length}名）</span>
                        )}
                    </div>

                    {/* メンバー一覧 */}
                    <div className={styles.memberList}>
                        {attendances.map(entry => (
                            <div key={entry.id} className={styles.memberCard}>
                                <div className={styles.memberHeader}>
                                    <span className={styles.memberName}>
                                        {entry.name}
                                        {entry.isGuest && <span className={styles.guestBadge}>ゲスト</span>}
                                    </span>
                                    {entry.isGuest && (
                                        <button
                                            className={styles.removeBtn}
                                            onClick={() => removeGuest(entry.id)}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className={styles.statusBtns}>
                                    <button
                                        className={`${styles.statusBtn} ${entry.status === 'present' ? styles.present : ''}`}
                                        onClick={() => updateAttendance(entry.id, 'status', 'present')}
                                    >
                                        出席
                                    </button>
                                    <button
                                        className={`${styles.statusBtn} ${entry.status === 'absent' ? styles.absent : ''}`}
                                        onClick={() => updateAttendance(entry.id, 'status', 'absent')}
                                    >
                                        欠席
                                    </button>
                                    <button
                                        className={`${styles.statusBtn} ${entry.status === 'undecided' ? styles.undecided : ''}`}
                                        onClick={() => updateAttendance(entry.id, 'status', 'undecided')}
                                    >
                                        未定
                                    </button>
                                </div>

                                {entry.status === 'present' && (
                                    <div className={styles.earlyLeaveSection}>
                                        <label className={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={entry.earlyLeave}
                                                onChange={(e) => updateAttendance(entry.id, 'earlyLeave', e.target.checked)}
                                            />
                                            <span>早退予定</span>
                                        </label>
                                        {entry.earlyLeave && (
                                            <input
                                                type="time"
                                                className={styles.earlyLeaveTime}
                                                value={entry.earlyLeaveTime}
                                                onChange={(e) => updateAttendance(entry.id, 'earlyLeaveTime', e.target.value)}
                                                placeholder="早退時刻"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ゲスト追加 */}
                    <div className={styles.guestSection}>
                        <h2 className={styles.sectionTitle}>ゲスト追加</h2>
                        <div className={styles.guestForm}>
                            <input
                                type="text"
                                className={styles.guestInput}
                                placeholder="ゲスト名を入力"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addGuest()}
                            />
                            <button
                                className={styles.addGuestBtn}
                                onClick={addGuest}
                                disabled={!guestName.trim()}
                            >
                                追加
                            </button>
                        </div>
                        <p className={styles.guestNote}>
                            ※ ゲストはランキング集計対象外です
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}/${date.getDate()}(${weekDays[date.getDay()]})`;
}

function formatDateFull(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日(${weekDays[date.getDay()]})`;
}
