const fs = require('fs');
const path = require('path');

(async () => {
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.test\.js$/.test(f)).sort();

    if (files.length === 0) {
        console.log('Nenhum arquivo *.test.js encontrado em tests/.');
        process.exit(1);
    }

    let falhas = 0;
    for (const f of files) {
        process.stdout.write(`▶ ${f} ... `);
        try {
            const testFn = require(path.join(dir, f));
            await testFn();
            console.log('✅');
        } catch (e) {
            console.log('❌');
            console.error('   ' + (e && e.stack ? e.stack.split('\n').join('\n   ') : String(e)));
            falhas++;
        }
    }

    console.log('\n' + (falhas === 0 ? `✅ Todos os ${files.length} testes passaram.` : `❌ ${falhas}/${files.length} teste(s) falharam.`));
    process.exit(falhas > 0 ? 1 : 0);
})();
