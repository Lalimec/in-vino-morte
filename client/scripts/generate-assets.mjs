/**
 * Generate splash screen and icon assets from SVG sources
 * Run with: node scripts/generate-assets.mjs
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, '..');

async function main() {
    console.log('🎨 Generating mobile assets...\n');

    // Check if source SVGs exist
    const iconSvg = join(clientDir, 'resources', 'icon.svg');
    const splashSvg = join(clientDir, 'resources', 'splash.svg');

    if (!existsSync(iconSvg) || !existsSync(splashSvg)) {
        console.error('❌ Source SVG files not found in resources/');
        process.exit(1);
    }

    // Try to import sharp dynamically
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch {
        console.error('❌ Sharp is not installed. Please run:');
        console.error('   npm install sharp --save-dev');
        process.exit(1);
    }

    // Generate icon PNG (1024x1024)
    console.log('📱 Generating icon.png (1024x1024)...');
    await sharp(iconSvg)
        .resize(1024, 1024)
        .png()
        .toFile(join(clientDir, 'resources', 'icon.png'));
    console.log('   ✓ icon.png created');

    // Generate splash PNG (2732x2732)
    console.log('📱 Generating splash.png (2732x2732)...');
    await sharp(splashSvg)
        .resize(2732, 2732)
        .png()
        .toFile(join(clientDir, 'resources', 'splash.png'));
    console.log('   ✓ splash.png created');

    // Generate splash-dark PNG (same as splash for dark mode)
    console.log('📱 Generating splash-dark.png (2732x2732)...');
    await sharp(splashSvg)
        .resize(2732, 2732)
        .png()
        .toFile(join(clientDir, 'resources', 'splash-dark.png'));
    console.log('   ✓ splash-dark.png created');

    console.log('\n✅ All source assets generated!');
    console.log('\nNext steps:');
    console.log('  1. Run: npx @capacitor/assets generate');
    console.log('  2. Run: npx cap sync');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
