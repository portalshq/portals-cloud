import type { Metadata } from 'next'
import { marketingMetadata } from '@/lib/seo'
import { NewsletterForm } from '@/components/leads/NewsletterForm'

export const metadata: Metadata = marketingMetadata({
    title: 'Experiments in interactive entertainment formats | Newsletter',
    description: 'Consumer fanship, platform economics, and the science of retention, tested live.',
    path: '/newsletter',
    image: null,
})

export default function NewsletterEnrollmentPage() {
    return (
        <main data-header-theme="light" className="fixed z-(--z-main) h-[calc(100vh-58px)] w-screen bottom-0 bg-[#161616]">
            <div className="h-full w-full flex flex-col justify-center items-center p-sms">
                <NewsletterForm />
            </div>
        </main>
    )
}
