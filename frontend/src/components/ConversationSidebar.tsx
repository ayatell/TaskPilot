import type { Conversation } from '../types'

type Props = {
    conversations: Conversation[]
    activeId: number | null
    onSelect: (id: number) => void
    onCreate: () => void
    onDelete: (id: number) => void
    onRename: (id: number, title: string) => void
}

export default function ConversationSidebar({
    conversations,
    activeId,
    onSelect,
    onCreate,
    onDelete,
    onRename,
}: Props) {
    const handleDelete = (id: number, title: string) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${title}"?\n\nThis will permanently delete this conversation and all its messages.`
        )

        if (confirmed) {
            onDelete(id)
        }
    }

    const handleRename = (id: number, currentTitle: string) => {
        const title = window.prompt(
            'Enter a new conversation title:',
            currentTitle
        )

        if (title?.trim() && title.trim() !== currentTitle) {
            onRename(id, title.trim())
        }
    }

    return (
        <aside className="conversation-sidebar">
            <button
                type="button"
                className="btn btn-gradient w-full"
                onClick={onCreate}
            >
                + New conversation
            </button>

            <h3 className="mt-5 text-sm font-semibold">
                Your conversations ({conversations.length})
            </h3>

            <div className="mt-3 flex flex-col gap-2">
                {conversations.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                        No conversations yet. Start a new one!
                    </p>
                ) : (
                    conversations.map((conversation) => (
                        <div
                            key={conversation.id}
                            className={`conversation-item ${activeId === conversation.id ? 'active' : ''
                                }`}
                        >
                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onSelect(conversation.id)}
                            >
                                <span className="block truncate text-sm font-semibold">
                                    {conversation.title}
                                </span>

                                <span className="text-xs text-slate-500">
                                    {new Date(
                                        conversation.updated_at
                                    ).toLocaleDateString()}
                                </span>
                            </button>

                            <details className="relative">
                                <summary
                                    className="cursor-pointer list-none rounded-md px-2 py-1 hover:bg-slate-100"
                                    aria-label={`Actions for ${conversation.title}`}
                                    title="Conversation actions"
                                >
                                    ⋯
                                </summary>

                                <div className="absolute right-0 z-30 mt-2 w-48 rounded-lg border bg-white p-2 shadow-lg">
                                    <button
                                        type="button"
                                        className="block w-full rounded-md p-2 text-left text-sm hover:bg-slate-100"
                                        onClick={(event) => {
                                            handleRename(
                                                conversation.id,
                                                conversation.title
                                            )

                                            const details = event.currentTarget.closest('details')
                                            details?.removeAttribute('open')
                                        }}
                                    >
                                        Rename
                                    </button>

                                    <div className="my-1 border-t" />

                                    <button
                                        type="button"
                                        className="block w-full rounded-md p-2 text-left text-sm text-red-600 hover:bg-red-50"
                                        onClick={(event) => {
                                            const details = event.currentTarget.closest('details')
                                            details?.removeAttribute('open')

                                            handleDelete(
                                                conversation.id,
                                                conversation.title
                                            )
                                        }}
                                    >
                                        <span className="mr-2">🗑️</span>
                                        Delete conversation
                                    </button>
                                </div>
                            </details>
                        </div>
                    ))
                )}
            </div>
        </aside>
    )
}
