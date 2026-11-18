import { readChat, writeChat } from '../../../lib/audience-chat'

export function GET(request: Request) { return readChat(request) }
export function POST(request: Request) { return writeChat(request) }
