import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CommandBarContext = createContext();

export function CommandBarProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(p => !p), []);

    useEffect(() => {
        const down = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                toggle();
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [toggle]);

    return (
        <CommandBarContext.Provider value={{ isOpen, open, close, toggle }}>
            {children}
        </CommandBarContext.Provider>
    );
}

export function useCommandBar() {
    return useContext(CommandBarContext);
}
