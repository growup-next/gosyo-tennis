import { NextRequest, NextResponse } from 'next/server';

// Google Sheets API の設定
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.split(String.raw`\n`).join('\n')
    : undefined;

// シート名と対応するヘッダー
const SHEETS = {
    Matches: ['id', 'eventId', 'matchNumber', 'team1Player1', 'team1Player2', 'team2Player1', 'team2Player2', 'coinTossWinner', 'coinTossChoice', 'coinTossLoserSide', 'isNoGame', 'noGameReason', 'isConfirmed', 'createdAt'],
    Results: ['matchId', 'eventId', 'team1Games', 'team2Games', 'winner', 'updatedAt'],
    Attendance: ['eventId', 'memberId', 'status', 'earlyLeave', 'earlyLeaveTime', 'updatedAt'],
};

type SheetName = keyof typeof SHEETS;

/**
 * アクセストークンを取得
 */
async function getAccessToken(): Promise<string> {
    if (!CLIENT_EMAIL || !PRIVATE_KEY) {
        throw new Error('Google Sheets credentials are not configured');
    }

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

    if (!response.ok) {
        throw new Error(`Token fetch failed: ${JSON.stringify(data)}`);
    }

    return data.access_token;
}

/**
 * JWT を作成
 */
async function createJWT(): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${headerB64}.${payloadB64}`;

    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(PRIVATE_KEY!, 'base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * シートが存在するか確認し、なければ作成する
 */
async function ensureSheetExists(accessToken: string, sheetName: SheetName): Promise<void> {
    console.log('Checking if sheet exists:', sheetName);

    const infoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    const infoData = await infoResponse.json();

    if (!infoResponse.ok) {
        throw new Error(`Failed to get spreadsheet info: ${JSON.stringify(infoData)}`);
    }

    const sheets = infoData.sheets || [];
    const sheetExists = sheets.some(
        (s: { properties?: { title?: string } }) => s.properties?.title === sheetName
    );

    if (!sheetExists) {
        console.log('Creating sheet:', sheetName);

        const createResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [{ addSheet: { properties: { title: sheetName } } }],
                }),
            }
        );

        const createData = await createResponse.json();
        if (!createResponse.ok) {
            throw new Error(`Failed to create sheet: ${JSON.stringify(createData)}`);
        }

        console.log('Sheet created successfully');
    }

    // ヘッダー行を確認・設定
    const headers = SHEETS[sheetName];
    const headerResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:${String.fromCharCode(64 + headers.length)}1`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    const headerData = await headerResponse.json();

    if (!headerData.values || headerData.values.length === 0 || headerData.values[0].length === 0) {
        console.log('Setting header row for:', sheetName);

        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=USER_ENTERED`,
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
}

/**
 * POST: データを保存
 */
export async function POST(request: NextRequest) {
    console.log('=== API /api/sheets/data POST ===');

    try {
        const body = await request.json();
        console.log('Request body:', JSON.stringify(body));

        const { sheetName, data } = body;

        if (!sheetName || !data) {
            return NextResponse.json(
                { error: 'Missing required fields: sheetName and data' },
                { status: 400 }
            );
        }

        if (!SHEETS[sheetName as SheetName]) {
            return NextResponse.json(
                { error: `Invalid sheet name: ${sheetName}. Valid names: ${Object.keys(SHEETS).join(', ')}` },
                { status: 400 }
            );
        }

        const accessToken = await getAccessToken();
        await ensureSheetExists(accessToken, sheetName as SheetName);

        const headers = SHEETS[sheetName as SheetName];
        const rowData = headers.map(h => data[h] ?? '');

        console.log('Appending row:', rowData);

        const appendResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ values: [rowData] }),
            }
        );

        const appendData = await appendResponse.json();

        if (!appendResponse.ok) {
            console.error('Append failed:', appendData);
            return NextResponse.json(
                { error: 'Failed to append data', details: appendData },
                { status: 500 }
            );
        }

        console.log('Data saved successfully');
        return NextResponse.json({
            success: true,
            message: `Data saved to ${sheetName}`,
            data: appendData,
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

/**
 * GET: データを取得
 */
export async function GET(request: NextRequest) {
    console.log('=== API /api/sheets/data GET ===');

    try {
        const { searchParams } = new URL(request.url);
        const sheetName = searchParams.get('sheet');

        if (!sheetName || !SHEETS[sheetName as SheetName]) {
            return NextResponse.json(
                { error: `Invalid or missing sheet name. Valid names: ${Object.keys(SHEETS).join(', ')}` },
                { status: 400 }
            );
        }

        const accessToken = await getAccessToken();

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            // シートが存在しない場合は空配列を返す
            if (data.error?.code === 400) {
                return NextResponse.json({ data: [] });
            }
            return NextResponse.json(
                { error: 'Failed to read sheet', details: data },
                { status: 500 }
            );
        }

        if (!data.values || data.values.length === 0) {
            return NextResponse.json({ data: [] });
        }

        const [headers, ...rows] = data.values;
        const result = rows.map((row: string[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((header: string, index: number) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });

        return NextResponse.json({ data: result });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
