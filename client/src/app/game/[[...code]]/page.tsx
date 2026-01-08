import GameClient from './GameClient';

// Required for static export - generates the base route
export async function generateStaticParams() {
    return [{ code: [] }]; // Empty array = base path only
}

export default function GamePage() {
    return <GameClient />;
}
