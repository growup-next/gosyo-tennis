import { Event, Attendance, Match, SheetRow } from '@/types';

// Google Sheets API の設定
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

// シート名定義
export const SHEET_NAMES = {
    EVENTS: 'Events',
    ATTENDANCE: 'Attendance',
    MATCHES: 'Matches',
    RESULTS: 'Results',
    RANKINGS: 'Rankings',
} as const;

/**
 * Google Sheets API 認証トークンを取得
 */
async function getAccessToken(): Promise<string> {
    if (!CLIENT_EMAIL || !PRIVATE_KEY) {
        throw new Error('Google Sheets credentials are not configured');
    }

    // JWT を使用してアクセストークンを取得
    const jwt = await createJWT();

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    const data = await response.json();
    return data.access_token;
}

/**
 * JWT を作成
 */
async function createJWT(): Promise<string> {
    const header = {
        alg: 'RS256',
        typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header));
    const payloadB64 = btoa(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;

    // Node.js 環境での署名
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(PRIVATE_KEY!, 'base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * シートからデータを読み込み
 */
export async function readSheet(sheetName: string): Promise<SheetRow[]> {
    const accessToken = await getAccessToken();

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const data = await response.json();

    if (!data.values || data.values.length === 0) {
        return [];
    }

    const [headers, ...rows] = data.values;
    return rows.map((row: string[]) => {
        const obj: SheetRow = {};
        headers.forEach((header: string, index: number) => {
            obj[header] = row[index] || '';
        });
        return obj;
    });
}

/**
 * シートにデータを追加
 */
export async function appendToSheet(
    sheetName: string,
    rows: SheetRow[]
): Promise<void> {
    const accessToken = await getAccessToken();

    // 既存のヘッダーを取得
    const existingData = await readSheet(sheetName);
    const headers = existingData.length > 0
        ? Object.keys(existingData[0])
        : Object.keys(rows[0]);

    const values = rows.map(row => headers.map(h => row[h] ?? ''));

    await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}:append?valueInputOption=USER_ENTERED`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values }),
        }
    );
}

/**
 * シートを初期化（ヘッダー行を作成）
 */
export async function initializeSheet(
    sheetName: string,
    headers: string[]
): Promise<void> {
    const accessToken = await getAccessToken();

    // 新しいシートを作成を試みる
    try {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [{
                        addSheet: {
                            properties: { title: sheetName },
                        },
                    }],
                }),
            }
        );
    } catch {
        // シートが既に存在する場合は無視
    }

    // ヘッダー行を設定
    await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A1?valueInputOption=USER_ENTERED`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: [headers] }),
        }
    );
}

/**
 * イベントを保存
 */
export async function saveEvent(event: Event): Promise<void> {
    await appendToSheet(SHEET_NAMES.EVENTS, [{
        id: event.id,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        courtNumber: event.courtNumber,
    }]);
}

/**
 * 出欠情報を保存
 */
export async function saveAttendance(attendance: Attendance): Promise<void> {
    await appendToSheet(SHEET_NAMES.ATTENDANCE, [{
        eventId: attendance.eventId,
        memberId: attendance.memberId,
        status: attendance.status,
        earlyLeave: attendance.earlyLeave,
        earlyLeaveTime: attendance.earlyLeaveTime || '',
    }]);
}

/**
 * 試合を保存
 */
export async function saveMatch(match: Match): Promise<void> {
    await appendToSheet(SHEET_NAMES.MATCHES, [{
        id: match.id,
        eventId: match.eventId,
        matchNumber: match.matchNumber,
        team1Player1: match.team1[0],
        team1Player2: match.team1[1],
        team2Player1: match.team2[0],
        team2Player2: match.team2[1],
        coinTossWinner: match.coinToss?.winner || '',
        coinTossChoice: match.coinToss?.winnerChoice || '',
        coinTossLoserSide: match.coinToss?.loserSide || '',
        isNoGame: match.isNoGame,
        noGameReason: match.noGameReason || '',
        createdAt: match.createdAt,
    }]);
}

/**
 * 試合結果を保存
 */
export async function saveMatchResult(match: Match): Promise<void> {
    if (!match.score) return;

    await appendToSheet(SHEET_NAMES.RESULTS, [{
        matchId: match.id,
        eventId: match.eventId,
        team1Games: match.score.team1Games,
        team2Games: match.score.team2Games,
        winner: match.score.winner,
        updatedAt: new Date().toISOString(),
    }]);
}

/**
 * 日付でイベントを取得
 */
export async function getEventsByDate(date: string): Promise<Event[]> {
    const rows = await readSheet(SHEET_NAMES.EVENTS);
    return rows
        .filter(row => row.date === date)
        .map(row => ({
            id: row.id as string,
            date: row.date as string,
            startTime: row.startTime as string,
            endTime: row.endTime as string,
            courtNumber: Number(row.courtNumber) as 1 | 2 | 3 | 4 | 5,
        }));
}

/**
 * イベントIDで試合を取得
 */
export async function getMatchesByEventId(eventId: string): Promise<Match[]> {
    const rows = await readSheet(SHEET_NAMES.MATCHES);
    const results = await readSheet(SHEET_NAMES.RESULTS);

    return rows
        .filter(row => row.eventId === eventId)
        .map(row => {
            const result = results.find(r => r.matchId === row.id);

            return {
                id: row.id as string,
                eventId: row.eventId as string,
                matchNumber: Number(row.matchNumber),
                team1: [row.team1Player1 as string, row.team1Player2 as string] as [string, string],
                team2: [row.team2Player1 as string, row.team2Player2 as string] as [string, string],
                coinToss: row.coinTossWinner ? {
                    winner: row.coinTossWinner as 'team1' | 'team2',
                    winnerChoice: row.coinTossChoice as 'serve' | 'receive',
                    loserSide: row.coinTossLoserSide as 'left' | 'right',
                } : undefined,
                score: result ? {
                    team1Games: Number(result.team1Games),
                    team2Games: Number(result.team2Games),
                    winner: result.winner as 'team1' | 'team2',
                } : undefined,
                isNoGame: row.isNoGame === 'true' || row.isNoGame === true,
                noGameReason: row.noGameReason as string,
                createdAt: row.createdAt as string,
            };
        });
}
