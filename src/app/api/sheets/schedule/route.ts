import { NextRequest, NextResponse } from 'next/server';

// Google Sheets API の設定
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.split(String.raw`\n`).join('\n')
    : undefined;

const SHEET_NAME = 'Events';
const HEADERS = [
    'id',
    'date',
    'startTime',
    'endTime',
    'courtNumber',
    'createdAt',
    'status',
    'cancellationReason',
];

/**
 * アクセストークンを取得
 */
async function getAccessToken(): Promise<string> {
    console.log('Getting access token...');
    console.log('CLIENT_EMAIL:', CLIENT_EMAIL ? 'Set' : 'NOT SET');
    console.log('PRIVATE_KEY:', PRIVATE_KEY ? 'Set (length: ' + PRIVATE_KEY.length + ')' : 'NOT SET');
    console.log('SPREADSHEET_ID:', SPREADSHEET_ID ? 'Set' : 'NOT SET');

    if (!CLIENT_EMAIL || !PRIVATE_KEY) {
        throw new Error('Google Sheets credentials are not configured');
    }

    const jwt = await createJWT();
    console.log('JWT created successfully');

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
        console.error('Token fetch failed:', data);
        throw new Error(`Token fetch failed: ${JSON.stringify(data)}`);
    }

    console.log('Access token obtained successfully');
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
async function ensureSheetExists(accessToken: string): Promise<void> {
    console.log('Checking if sheet exists:', SHEET_NAME);

    // スプレッドシートの情報を取得
    const infoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const infoData = await infoResponse.json();

    if (!infoResponse.ok) {
        console.error('Failed to get spreadsheet info:', infoData);
        throw new Error(`Failed to get spreadsheet info: ${JSON.stringify(infoData)}`);
    }

    // シートが存在するか確認
    const sheets = infoData.sheets || [];
    const sheetExists = sheets.some(
        (s: { properties?: { title?: string } }) => s.properties?.title === SHEET_NAME
    );

    console.log('Available sheets:', sheets.map((s: { properties?: { title?: string } }) => s.properties?.title));
    console.log('Sheet exists:', sheetExists);

    if (!sheetExists) {
        console.log('Creating sheet:', SHEET_NAME);

        // シートを作成
        const createResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: SHEET_NAME,
                                },
                            },
                        },
                    ],
                }),
            }
        );

        const createData = await createResponse.json();
        console.log('Create sheet response:', JSON.stringify(createData));

        if (!createResponse.ok) {
            throw new Error(`Failed to create sheet: ${JSON.stringify(createData)}`);
        }

        console.log('Sheet created successfully');
    }

    // ヘッダー行を確認・設定
    await ensureHeaderRow(accessToken);
}

/**
 * シートのヘッダー行を確認・設定
 */
async function ensureHeaderRow(accessToken: string): Promise<void> {
    console.log('Checking header row...');

    // 現在のヘッダー行を取得
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A1:H1`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const data = await response.json();
    console.log('Current header row response:', JSON.stringify(data));

    const currentHeaders = data.values?.[0] || [];
    const needsUpdate = HEADERS.some((header, index) => currentHeaders[index] !== header);

    // 既存シートにも中止情報の列を追加する
    if (needsUpdate) {
        console.log('Setting header row:', HEADERS);
        const setResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A1:H1?valueInputOption=USER_ENTERED`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [HEADERS],
                }),
            }
        );

        const setData = await setResponse.json();
        console.log('Set header row response:', JSON.stringify(setData));

        if (!setResponse.ok) {
            throw new Error(`Failed to set header row: ${JSON.stringify(setData)}`);
        }

        console.log('Header row set successfully');
    } else {
        console.log('Header row already exists:', currentHeaders);
    }
}

/**
 * POST: スケジュールを保存
 */
export async function POST(request: NextRequest) {
    console.log('=== API /api/sheets/schedule POST ===');

    try {
        const body = await request.json();
        console.log('Request body:', JSON.stringify(body));

        const {
            id,
            date,
            startTime,
            endTime,
            courtNumber,
            status = 'scheduled',
            cancellationReason = '',
        } = body;

        if (!date || !startTime || !endTime || !courtNumber) {
            console.log('Missing required fields');
            return NextResponse.json(
                { error: 'Missing required fields', details: { date, startTime, endTime, courtNumber } },
                { status: 400 }
            );
        }

        if (!['scheduled', 'cancelled'].includes(status)) {
            return NextResponse.json(
                { error: 'Invalid status' },
                { status: 400 }
            );
        }

        if (status === 'cancelled' && !String(cancellationReason).trim()) {
            return NextResponse.json(
                { error: 'Cancellation reason is required' },
                { status: 400 }
            );
        }

        // 認証
        const accessToken = await getAccessToken();
        console.log('Authentication successful');

        // シートの存在確認・作成とヘッダー行設定
        await ensureSheetExists(accessToken);

        const eventId = id || `event_${date}_${Date.now()}`;
        const existingResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A2:H`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );
        const existingData = await existingResponse.json();

        if (!existingResponse.ok) {
            throw new Error(`Failed to read existing events: ${JSON.stringify(existingData)}`);
        }

        const existingRows = (existingData.values || []) as string[][];
        const existingRowIndex = existingRows.findIndex(row => row[0] === eventId);
        const createdAt = existingRowIndex >= 0
            ? existingRows[existingRowIndex][5] || new Date().toISOString()
            : new Date().toISOString();

        const rowData = [
            eventId,
            date,
            startTime,
            endTime,
            courtNumber,
            createdAt,
            status,
            status === 'cancelled' ? String(cancellationReason).trim() : '',
        ];

        console.log('Saving row:', rowData);

        if (existingRowIndex >= 0) {
            const rowNumber = existingRowIndex + 2;
            const updateResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A${rowNumber}:H${rowNumber}?valueInputOption=USER_ENTERED`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ values: [rowData] }),
                }
            );
            const updateData = await updateResponse.json();

            if (!updateResponse.ok) {
                return NextResponse.json(
                    { error: 'Failed to update data', details: updateData },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                action: 'update',
                message: 'Schedule updated in Google Sheets',
                data: updateData,
            });
        }

        const appendResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [rowData],
                }),
            }
        );

        const appendData = await appendResponse.json();
        console.log('Append response:', JSON.stringify(appendData));

        if (!appendResponse.ok) {
            console.error('Append failed:', appendData);
            return NextResponse.json(
                { error: 'Failed to append data', details: appendData },
                { status: 500 }
            );
        }

        console.log('Schedule saved successfully');
        return NextResponse.json({
            success: true,
            action: 'insert',
            message: 'Schedule saved to Google Sheets',
            data: appendData
        });

    } catch (error) {
        console.error('=== API Error ===');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Error stack:', error instanceof Error ? error.stack : '');

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
 * GET: スケジュール一覧を取得
 */
export async function GET() {
    console.log('=== API /api/sheets/schedule GET ===');

    try {
        const accessToken = await getAccessToken();
        console.log('Authentication successful');

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const data = await response.json();
        console.log('Sheet data response:', JSON.stringify(data));

        if (!response.ok) {
            console.error('Failed to read sheet:', data);
            return NextResponse.json(
                { error: 'Failed to read sheet', details: data },
                { status: 500 }
            );
        }

        // ヘッダー行とデータ行を分離
        if (!data.values || data.values.length === 0) {
            return NextResponse.json({ events: [] });
        }

        const [headers, ...rows] = data.values;
        const events = rows.map((row: string[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((header: string, index: number) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });

        console.log('Events retrieved:', events.length);
        return NextResponse.json({ events });

    } catch (error) {
        console.error('=== API Error ===');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');

        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
