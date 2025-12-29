import { Member } from '@/types';

// 固定メンバー12名
export const FIXED_MEMBERS: Member[] = [
    { id: 'adachi', name: '足立', isGuest: false },
    { id: 'imamiya', name: '今宮', isGuest: false },
    { id: 'kojima', name: '小島', isGuest: false },
    { id: 'mimori', name: '未森', isGuest: false },
    { id: 'suzuka', name: '鈴鹿', isGuest: false },
    { id: 'tanaka', name: '田中', isGuest: false },
    { id: 'tsuchida', name: '土田', isGuest: false },
    { id: 'toyofuku', name: '豊福', isGuest: false },
    { id: 'nishizawa', name: '西沢', isGuest: false },
    { id: 'hashimoto', name: '橋本', isGuest: false },
    { id: 'miyagi', name: '宮城', isGuest: false },
    { id: 'iwata', name: '岩田', isGuest: false },
];

// ゲストメンバーを作成
export function createGuest(name: string): Member {
    const id = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
        id,
        name,
        isGuest: true,
    };
}

// 全メンバーからIDで検索
export function findMemberById(members: Member[], id: string): Member | undefined {
    return members.find(m => m.id === id);
}

// メンバー名からIDで検索
export function findMemberByName(members: Member[], name: string): Member | undefined {
    return members.find(m => m.name === name);
}
