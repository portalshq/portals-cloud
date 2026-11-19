import { readChat, writeChat } from '../../../../../lib/audience-chat'

type Context = { params: Promise<{ programId: string }> }

export async function GET(request: Request, { params }: Context) {
  const { programId } = await params
  return readChat(request, { kind: 'program', programId })
}

export async function POST(request: Request, { params }: Context) {
  const { programId } = await params
  return writeChat(request, { kind: 'program', programId })
}
