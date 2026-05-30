import { BaseMessage } from "../shared/protocol";
import { User } from "./User";  
export class Room {
    readonly name: string;
    readonly createTime: Date;
    private password?: string;
    private users:Set<string> = new Set();// 当前在房间内的用户列表
    readonly messageHistory: MessageHistory;
    private maxUsers: number = 100; // 房间最大用户数

    constructor(name: string, options?: { password?: string; maxUsers?: number }) {
        this.name = name;
        this.createTime = new Date();
        if (options?.password) {
            this.password = options.password;
        }
        if (options?.maxUsers) {
            this.maxUsers = options.maxUsers;
        }
        this.messageHistory = new MessageHistory();
        
    }
    //添加用户
    addUser(user: User): boolean {
        if (this.users.size >= this.maxUsers) {
            return false; // 房间已满
        }
        this.users.add(user.nickname);
        return true;
    }
    //移除用户
    removeUser(user: User): void {
        this.users.delete(user.nickname);
    }
    //获取用户列表
    getUserList(): string[] {
        return Array.from(this.users);
    }
    //获取用户数量
    getUserCount(): number {
        return this.users.size;
    }
    //检测房间是否已满
    isFull(): boolean {
        return this.users.size >= this.maxUsers;
    }
    //验证密码
    validatePassword(password: string): boolean {
        if (!this.password) return true; // 无密码房间直接通过
        return this.password === password;
    }
    addMessage(msg: BaseMessage): void {
        this.messageHistory.addMessage(msg);
    }
    //获取消息历史
    getMessageHistory(count: number = 20): BaseMessage[] {
        return this.messageHistory.getHistory(count);
    }
    //获取信息摘要
    getInfo() {
        return {
            name: this.name,
            createTime: this.createTime,
            hasPassword: !!this.password,
            userCount: this.getUserCount(),
        };
    }
}
class MessageHistory {
    private messages: BaseMessage[] = [];
    private maxHistory: number = 100; // 最多保存100条消息

    addMessage(msg: BaseMessage): void {
        if (this.messages.length >= this.maxHistory) {
            this.messages.shift(); // 删除最旧的消息
        }   
        this.messages.push(msg);
    }

    getHistory(count: number = 20): BaseMessage[] {
        return this.messages.slice(-count); // 获取最新的count条消息
    }


}
