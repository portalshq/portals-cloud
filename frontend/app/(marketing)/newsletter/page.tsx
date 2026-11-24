import type { Metadata } from 'next'
import { marketingMetadata } from '@/lib/seo'
import { NewsletterForm } from '@/components/leads/NewsletterForm'

export const metadata: Metadata = marketingMetadata({
    title: 'Experiments in interactive entertainment formats | Newsletter',
    description: 'Massive Reality is a newsletter on the interactive entertainment industry, consumer fanship, and AI, with original research and experiments.',
    path: '/newsletter',
    image: null,
})

export default function NewsletterEnrollmentPage() {
    // <main className="h-[calc(100vh-62px)] justify-self-end bottom-0 z-[10000] bg-[#161616] fixed w-screen">
    return (
        <main data-header-theme="light" className="fixed z-(--z-main) h-[calc(100vh-58px)] w-screen bottom-0 bg-[#161616]">
            <div className="h-full w-full flex flex-col justify-center items-center p-sms">
                <NewsletterForm />
            </div>
        </main>
    )
}
