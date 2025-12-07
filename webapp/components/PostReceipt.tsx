// webapp/components/PostReceipt.tsx
import React, { FC, ReactElement, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import VisibilityTracker from './VisibilityTracker';
import { Post } from '../types/mattermost-webapp';
import { RootState } from '../store/types';
import { selectReaders } from '../store/channelReaders';

interface PostReceiptProps {
    post: Post;
}

// Get user display name from Mattermost store
const getUserDisplayName = (userId: string): string => {
    try {
        const mmStore = (window as any).store;
        const user = mmStore?.getState()?.entities?.users?.profiles?.[userId];
        if (user) {
            return user.nickname ||
                `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                user.username ||
                `User ${userId.substring(0, 8)}`;
        }
    } catch {
        // Ignore errors
    }
    return `User ${userId.substring(0, 8)}`;
};

const PostReceipt: FC<PostReceiptProps> = ({ post }): ReactElement | null => {
    // Local state to trigger re-renders
    const [renderCount, setRenderCount] = useState(0);

    // Early returns for invalid posts
    if (!post?.id || !post?.user_id || !post?.channel_id) {
        return null;
    }

    const messageId = post.id;
    const channelId = post.channel_id;

    // Get readers from Redux
    const readerIds = useSelector((state: RootState) =>
        selectReaders(state, channelId, messageId)
    );

    // Get current user ID
    const currentUserId = document.cookie.match(/MMUSERID=([^;]+)/)?.[1] ||
        window.localStorage.getItem('MMUSERID') || '';

    // Is this my own message?
    const isOwnMessage = post.user_id === currentUserId;

    // Force re-render periodically after channel data loads
    // This is a workaround for React not detecting Redux changes on channel switch
    useEffect(() => {
        // Set up a timer to force re-renders for a short period after mount
        let count = 0;
        const maxRerenders = 5;
        const interval = setInterval(() => {
            count++;
            if (count <= maxRerenders) {
                setRenderCount(c => c + 1);
            } else {
                clearInterval(interval);
            }
        }, 300);

        return () => clearInterval(interval);
    }, [channelId]); // Re-run when channel changes

    // For messages by others, show VisibilityTracker if not seen
    if (!isOwnMessage) {
        const seenByMe = readerIds.includes(currentUserId);
        if (!seenByMe) {
            return (
                <VisibilityTracker
                    messageId={messageId}
                    postAuthorId={post.user_id}
                    channelId={channelId}
                />
            );
        }
        return null;
    }

    // For own messages, show "Seen by" if others have read it
    const seenByOthers = readerIds.filter(id => id !== currentUserId);

    if (seenByOthers.length === 0) {
        return null;
    }

    // Get display names
    const displayNames = seenByOthers.map(getUserDisplayName);

    return (
        <div
            className="post-receipt-container"
            data-post-id={messageId}
        >
            <div
                className="post-receipt"
                style={{
                    fontSize: '11px',
                    color: 'rgba(63, 67, 80, 0.72)',
                    padding: '4px 0',
                    marginTop: '2px',
                    display: 'inline-flex',
                    alignItems: 'center'
                }}
            >
                <span className="read-receipt-text">
                    Seen by {displayNames.join(', ')}
                </span>
            </div>
        </div>
    );
};

export default PostReceipt;