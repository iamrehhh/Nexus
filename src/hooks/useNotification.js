import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

export function useNotification() {
    const notify = {
        success: (message) => toast(message, {
            icon: <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />,
            style: { borderLeft: '3px solid var(--accent-green)' }
        }),

        error: (message) => toast(message, {
            icon: <XCircle size={18} style={{ color: 'var(--accent-red)' }} />,
            style: { borderLeft: '3px solid var(--accent-red)' }
        }),

        info: (message) => toast(message, {
            icon: <Info size={18} style={{ color: 'var(--accent-blue)' }} />,
            style: { borderLeft: '3px solid var(--accent-blue)' }
        }),

        warning: (message) => toast(message, {
            icon: <AlertCircle size={18} style={{ color: 'var(--accent-amber)' }} />,
            style: { borderLeft: '3px solid var(--accent-amber)' }
        }),

        loading: (message) => toast(message, {
            icon: <Loader2 size={18} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />,
            style: { borderLeft: '3px solid var(--accent)' }
        })
    };

    return notify;
}
