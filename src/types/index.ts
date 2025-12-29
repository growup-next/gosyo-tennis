// メンバー型
export interface Member {
  id: string;
  name: string;
  isGuest: boolean;
}

// 開催情報型
export interface Event {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courtNumber: 1 | 2 | 3 | 4 | 5;
}

// 出欠状態
export type AttendanceStatus = 'present' | 'absent' | 'undecided';

// 出欠情報型
export interface Attendance {
  eventId: string;
  memberId: string;
  status: AttendanceStatus;
  earlyLeave: boolean;
  earlyLeaveTime?: string;
}

// コイントス結果型
export interface CoinTossResult {
  winner: 'team1' | 'team2';
  winnerChoice: 'serve' | 'receive';
  loserSide: 'left' | 'right';
}

// スコア型
export interface Score {
  team1Games: number;
  team2Games: number;
  winner: 'team1' | 'team2';
}

// 試合型
export interface Match {
  id: string;
  eventId: string;
  matchNumber: number;
  team1: [string, string];  // メンバーID配列
  team2: [string, string];
  coinToss?: CoinTossResult;
  score?: Score;
  isNoGame: boolean;
  noGameReason?: string;
  isConfirmed?: boolean;  // 試合確定フラグ
  createdAt: string;
}

// 試合形式
export type MatchFormat = 'no-ad' | 'one-deuce';

// 成績型
export interface PlayerStats {
  memberId: string;
  memberName: string;
  isGuest: boolean;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  rank?: number;
}

// 開催データ全体型
export interface EventData {
  event: Event;
  attendances: Attendance[];
  matches: Match[];
}

// Google Sheets 行データ型
export interface SheetRow {
  [key: string]: string | number | boolean;
}
