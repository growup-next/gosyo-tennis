import { NextResponse } from 'next/server';

// Google Sheets API の設定
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.split(String.raw`\n`).join('\n')
    : undefined;

/**
 * POST: 接続テスト
 */
export async function POST() {
    console.log('=== API /api/sheets/test POST ===');

    const result = {
        timestamp: new Date().toISOString(),
        environment: {
            spreadsheetId: SPREADSHEET_ID ? `Set (${SPREADSHEET_ID.substring(0, 10)}...)` : 'NOT SET',
            clientEmail: CLIENT_EMAIL ? `Set (${CLIENT_EMAIL})` : 'NOT SET',
            privateKey: PRIVATE_KEY ? `Set (length: ${PRIVATE_KEY.length})` : 'NOT SET',
        },
        authentication: 'Not tested',
        sheetAccess: 'Not tested',
    };

    // 認証情報が設定されているか確認
    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
        result.authentication = 'FAILED: Missing credentials';
        console.log('Test result:', result);
        return NextResponse.json({ ...result, status: 'NG' }, { status: 400 });
    }

    try {
        // JWT作成テスト
        const jwt = await createJWT();
        console.log('JWT created successfully');

        // トークン取得テスト
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            result.authentication = `FAILED: ${JSON.stringify(tokenData)}`;
            console.log('Test result:', result);
            return NextResponse.json({ ...result, status: 'NG' }, { status: 500 });
        }

        result.authentication = 'OK';
        const accessToken = tokenData.access_token;

        // シートアクセステスト
        const sheetResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const sheetData = await sheetResponse.json();

        if (!sheetResponse.ok) {
            result.sheetAccess = `FAILED: ${JSON.stringify(sheetData)}`;
            console.log('Test result:', result);
            return NextResponse.json({ ...result, status: 'NG' }, { status: 500 });
        }

        result.sheetAccess = `OK (Title: ${sheetData.properties?.title || 'Unknown'})`;

        // シート一覧を取得
        const sheets = sheetData.sheets?.map((s: { properties?: { title?: string } }) => s.properties?.title) || [];

        console.log('Test result:', result);
        return NextResponse.json({
            ...result,
            status: 'OK',
            sheetTitle: sheetData.properties?.title,
            availableSheets: sheets,
        });

    } catch (error) {
        console.error('Test error:', error);
        return NextResponse.json({
            ...result,
            status: 'NG',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
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
