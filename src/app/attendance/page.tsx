'use client';

import { useState, useEffect } from 'react';
import { FIXED_MEMBERS, createGuest } from '@/data/members';
import { Member, AttendanceStatus, Attendance } from '@/types';
import styles from './page.module.css';

interface AttendanceEntry extends Member {
    status: AttendanceStatus;
    earlyLeave: boolean;
    earlyLeaveTime: string;
}

export default function AttendancePage() {
    const [attendances, setAttendances] = useState<AttendanceEntry[]>([]);
    const [guestName, setGuestName] = useState('');
    const [currentEvent, setCurrentEvent] = useState<{ id: string; date: string } | null>(null);

    useEffect(() => {
        // 現在のイベントを取得
        const eventStr = localStorage.getItem('current_event');
        if (eventStr) {
            setCurrentEvent(JSON.parse(eventStr));
        }

        // 固定メンバーの出欠初期化
        const initialAttendances: AttendanceEntry[] = FIXED_MEMBERS.map(member => ({
            ...member,
            status: 'undecided' as AttendanceStatus,
            earlyLeave: false,
            earlyLeaveTime: '',
        }));

        // 保存済みの出欠を復元
        const savedStr = localStorage.getItem('tennis_attendances');
        if (savedStr && eventStr) {
            const saved: Attendance[] = JSON.parse(savedStr);
            const eventId = JSON.parse(eventStr).id;

            initialAttendances.forEach(entry => {
                const savedEntry = saved.find(s => s.eventId === eventId && s.memberId === entry.id);
                if (savedEntry) {
                    entry.status = savedEntry.status;
                    entry.earlyLeave = savedEntry.earlyLeave;
                    entry.earlyLeaveTime = savedEntry.earlyLeaveTime || '';
                }
            });

            // ゲストを追加
            saved.filter(s => s.eventId === eventId && s.memberId.startsWith('guest_'))
                .forEach(guestAttendance => {
                    const existingGuests = JSON.parse(localStorage.getItem('tennis_guests') || '[]');
                    const guest = existingGuests.find((g: Member) => g.id === guestAttendance.memberId);
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
    }, []);

    const updateAttendance = (memberId: string, field: keyof AttendanceEntry, value: unknown) => {
        setAttendances(prev => {
            const updated = prev.map(a =>
                a.id === memberId ? { ...a, [field]: value } : a
            );

            // ローカルストレージに保存
            if (currentEvent) {
                const toSave: Attendance[] = updated.map(a => ({
                    eventId: currentEvent.id,
                    memberId: a.id,
                    status: a.status,
                    earlyLeave: a.earlyLeave,
                    earlyLeaveTime: a.earlyLeaveTime,
                }));
                localStorage.setItem('tennis_attendances', JSON.stringify(toSave));
            }

            return updated;
        });
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

        setAttendances(prev => [...prev, guestEntry]);
        setGuestName('');
    };

    const removeGuest = (guestId: string) => {
        setAttendances(prev => prev.filter(a => a.id !== guestId));

        // ゲストリストからも削除
        const existingGuests = JSON.parse(localStorage.getItem('tennis_guests') || '[]');
        const filtered = existingGuests.filter((g: Member) => g.id !== guestId);
        localStorage.setItem('tennis_guests', JSON.stringify(filtered));
    };

    const presentCount = attendances.filter(a => a.status === 'present').length;
    const earlyLeavers = attendances.filter(a => a.status === 'present' && a.earlyLeave);

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>✋ 出欠登録</h1>

            {currentEvent ? (
                <div className={styles.eventInfo}>
                    <span>📅 {formatDate(currentEvent.date)}</span>
                </div>
            ) : (
                <div className={styles.noEvent}>
                    <p>開催が登録されていません</p>
                    <a href="/schedule" className={styles.link}>開催を登録する →</a>
                </div>
            )}

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
        </div>
    );
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日(${weekDays[date.getDay()]})`;
}
