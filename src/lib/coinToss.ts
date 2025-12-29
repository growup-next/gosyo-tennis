import { CoinTossResult } from '@/types';

/**
 * コイントスを実行
 * @returns team1 または team2 が勝者
 */
export function performCoinToss(): 'team1' | 'team2' {
    return Math.random() < 0.5 ? 'team1' : 'team2';
}

/**
 * 完全なコイントス結果を生成（デフォルト選択付き）
 */
export function generateCoinTossResult(): CoinTossResult {
    const winner = performCoinToss();
    return {
        winner,
        winnerChoice: 'serve', // デフォルトはサービス選択
        loserSide: 'left',     // デフォルトは左サイド
    };
}

/**
 * コイントス結果の表示用テキスト
 */
export function getCoinTossDisplayText(
    result: CoinTossResult,
    team1Names: string[],
    team2Names: string[]
): string {
    const winnerNames = result.winner === 'team1' ? team1Names : team2Names;
    const loserNames = result.winner === 'team1' ? team2Names : team1Names;

    const choiceText = result.winnerChoice === 'serve' ? 'サービス' : 'レシーブ';
    const sideText = result.loserSide === 'left' ? '左サイド' : '右サイド';

    return `${winnerNames.join('・')} がトス勝ち → ${choiceText}を選択\n${loserNames.join('・')} → ${sideText}を選択`;
}
