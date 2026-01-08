import LobbyClient from './LobbyClient';

// Required for static export - generates the base route
export async function generateStaticParams() {
    return [{ code: [] }]; // Empty array = base path only
}

export default function LobbyPage() {
    return <LobbyClient />;
}
