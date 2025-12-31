/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { OptionType } from '@utils/types';
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from '@api/Settings';
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import { Button, Forms, TextArea } from "@webpack/common";

let lastHeartbeatAt = 0;

const settings = definePluginSettings({
    apiKey: {
        type: OptionType.STRING,
        description: 'API Key for wakatime',
        default: 'CHANGEME',
        isValid: (e: string) => {
            if (e === "CHANGEME") return "Invalid Key: Please change the default API Key";
            if (!e.startsWith("waka_")) return "Invalid Key: Key must start with 'waka_'";
            return true;
        },
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: 'Enable debug mode',
        default: false,
    },
    machineName: {
        type: OptionType.STRING,
        description: 'Machine name',
        default: 'Vencord User',
    },
    projectName: {
        type: OptionType.STRING,
        description: "Project Name",
        default: "Discord",
    },
    proxyUrl: {
        type: OptionType.STRING,
        description: "Optional local proxy URL (e.g. http://127.0.0.1:9524/heartbeat) — useful when Discord's CSP blocks direct requests.",
        default: '',
    },
        proxyAutoStart: {
            type: OptionType.BOOLEAN,
            description: 'Automatically start an embedded local proxy (requires Node integration).',
            default: true,
        },
        proxyPort: {
            type: OptionType.STRING,
            description: 'Port for embedded proxy (127.0.0.1).',
            default: '9525',
        },
});

function enoughTimePassed() {
    return lastHeartbeatAt + 120000 < Date.now();
}

async function sendHeartbeat(time) {
    const key = settings.store.apiKey;
    if (!key || key === 'CHANGEME') {
        showNotification({
            title: "WakaTime",
            body: "No api key for wakatime is setup.",
            color: "var(--red-360)",
            // onClick: () => {
            //     openModal(modalProps => (
            //         <ModalRoot {...modalProps}>
            //             <ModalHeader >
            //                 <Forms.FormTitle tag="h4">Theme Source</Forms.FormTitle>
            //             </ModalHeader>
            //             <ModalContent>
            //                 <Forms.FormText style={{
            //                     padding: "5px",
            //                 }}>
            //     <TextArea onChange={setting}>

            //     </TextArea>
            //                 </Forms.FormText>
            //             </ModalContent>
            //             <ModalFooter>
            //                 <Button
            //                     color={Button.Colors.RED}
            //                     look={Button.Looks.OUTLINED}
            //                     onClick={() => modalProps.onClose()}
            //                 >
            //                     Close
            //                 </Button>
            //             </ModalFooter>
            //         </ModalRoot>
            //     ));
            // },
            // dismissOnClick: false
        });

        return;
    }
    if (settings.store.debug) {
        console.log('Sending heartbeat to WakaTime API.');
    }

    const url = 'https://api.wakatime.com/api/v1/users/current/heartbeats';
    const body = JSON.stringify({
        time: time / 1000,
        entity: 'Discord',
        type: 'app',
        project: settings.store.projectName ?? "Discord",
        plugin: 'vencord/version discord-wakatime/v0.0.1',
    });
    const headers = {
        Authorization: `Basic ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': new TextEncoder().encode(body).length.toString(),
    };
    const machine = settings.store.machineName;
    if (machine) headers['X-Machine-Name'] = machine;
    const proxyUrl = (settings.store.proxyUrl || '').trim();
    if (proxyUrl) {
        try {
            if (settings.store.debug) console.log('WakaTime: sending heartbeat to proxy', proxyUrl);
            const proxyResp = await fetch(proxyUrl, {
                method: 'POST',
                body: body,
                headers: headers,
            });
            const proxyText = await proxyResp.text();
            if (proxyResp.status >= 200 && proxyResp.status < 300) {
                if (settings.store.debug) console.log('WakaTime: proxy delivered heartbeat');
                return;
            }
            console.warn(`WakaTime proxy error ${proxyResp.status}: ${proxyText}`);
        } catch (e) {
            if (settings.store.debug) console.warn('WakaTime: proxy request failed, falling back', e);
        }
    }
    try {
        if (typeof navigator !== 'undefined' && typeof (navigator as any).sendBeacon === 'function') {
            try {
                const blob = new Blob([body], { type: 'application/json' });
                const beaconOk = (navigator as any).sendBeacon(url, blob);
                if (beaconOk) {
                    if (settings.store.debug) console.log('WakaTime: sendBeacon succeeded');
                    return;
                }
            } catch (e) {
                if (settings.store.debug) console.warn('WakaTime: sendBeacon failed', e);
            }
        }

        const response = await fetch(url, {
            method: 'POST',
            body: body,
            headers: headers,
        });
        const data = await response.text();
        if (response.status < 200 || response.status >= 300) console.warn(`WakaTime API Error ${response.status}: ${data}`);
    } catch (err: any) {
        console.warn('WakaTime: heartbeat failed', err);
        showNotification({
            title: 'WakaTime',
            body: 'Failed to send heartbeat — request blocked by Content Security Policy or network error. Click to open copyable fallback commands.',
            color: 'var(--red-360)',
            onClick: () => {
                const fallback = buildFallbackCommands(url, body, headers);
                openModal(modalProps => (
                    <ModalRoot {...modalProps}>
                        <ModalHeader>
                            <Forms.FormTitle tag="h4">WakaTime Heartbeat (Fallback)</Forms.FormTitle>
                        </ModalHeader>
                        <ModalContent>
                            <Forms.FormText style={{ padding: '5px' }}>
                                <div style={{ marginBottom: 8 }}>Try one of the commands below on your machine. On Windows use <strong>curl.exe</strong> or PowerShell.</div>
                                <TextArea value={fallback} onChange={() => {}} />
                            </Forms.FormText>
                        </ModalContent>
                        <ModalFooter>
                            <Button
                                color={Button.Colors.GREY}
                                look={Button.Looks.OUTLINED}
                                onClick={() => {
                                    try {
                                        navigator.clipboard.writeText(fallback);
                                        showNotification({ title: 'WakaTime', body: 'Copied fallback commands to clipboard.' });
                                    } catch (e) {
                                        showNotification({ title: 'WakaTime', body: 'Could not copy to clipboard.' });
                                    }
                                }}
                            >
                                Copy
                            </Button>
                            <Button
                                color={Button.Colors.RED}
                                look={Button.Looks.OUTLINED}
                                onClick={() => modalProps.onClose()}
                            >
                                Close
                            </Button>
                        </ModalFooter>
                    </ModalRoot>
                ));
            },
        });
    }
}

function buildFallbackCommands(url: string, body: string, headers: Record<string, string>) {
    const headerFlagsPosix = Object.entries(headers)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');
    const safeBodyPosix = body.replace(/'/g, "'\\''");
    const curlPosix = `curl -X POST '${url}' ${headerFlagsPosix} --data '${safeBodyPosix}'`;

    const headerFlagsWin = Object.entries(headers)
        .map(([k, v]) => `-H "${k}: ${v.replace(/"/g, '\\"')}"`)
        .join(' ');
    const curlWin = `curl.exe -X POST "${url}" ${headerFlagsWin} --data '${body.replace(/'/g, "'\\''")}'`;

    const psBody = body.replace(/'/g, "''");
    const ps = `powershell -Command "Invoke-RestMethod -Uri '${url}' -Method Post -Headers @{
${Object.entries(headers).map(([k, v]) => `    '${k}'='${v.replace(/'/g, "'\''")}';`).join('\n')}
} -Body '${psBody}' -ContentType 'application/json'"`;

    return [
        'POSIX / WSL / Git Bash (Linux/macOS):',
        curlPosix,
        '',
        'Windows (cmd) using curl.exe:',
        curlWin,
        '',
        'PowerShell (native):',
        ps,
        '',
        'If these fail due to the same CSP/network restrictions, run a local proxy (e.g., on localhost) and point the plugin to it, or run the command on your machine outside of Discord.'
    ].join('\n');
}

let _embeddedProxyServer: any = null;

function startEmbeddedProxyIfPossible(portStr: string | number, pluginThis: any) {
    const port = typeof portStr === 'number' ? portStr : parseInt(String(portStr || '9525'), 10) || 9525;
    if (_embeddedProxyServer) return;

    const nodeRequire = (typeof window !== 'undefined' && (window as any).require) || (typeof global !== 'undefined' && (global as any).require) || undefined;
    if (!nodeRequire) {
        showNotification({ title: 'WakaTime', body: 'Cannot auto-start proxy: Node integration unavailable.' });
        return;
    }

    let http: any, https: any;
    try {
        http = nodeRequire('http');
        https = nodeRequire('https');
    } catch (e) {
        showNotification({ title: 'WakaTime', body: 'Cannot auto-start proxy: http/https modules not available.' });
        return;
    }

    try {
        const server = http.createServer((req: any, res: any) => {
            if (req.method !== 'POST' || !req.url || !req.url.startsWith('/heartbeat')) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const chunks: any[] = [];
            req.on('data', (c: any) => chunks.push(c));
            req.on('end', () => {
                const body = Buffer.concat(chunks);
                const opts = {
                    method: 'POST',
                    hostname: 'api.wakatime.com',
                    path: '/api/v1/users/current/heartbeats',
                    headers: {
                        'Content-Type': req.headers['content-type'] || 'application/json',
                        Authorization: req.headers['authorization'] || '',
                        'X-Machine-Name': req.headers['x-machine-name'] || '',
                    },
                };

                const out = https.request(opts, (r: any) => {
                    const outChunks: any[] = [];
                    r.on('data', (d: any) => outChunks.push(d));
                    r.on('end', () => {
                        const buf = Buffer.concat(outChunks);
                        res.writeHead(r.statusCode || 200, { 'Content-Type': 'text/plain' });
                        res.end(buf);
                    });
                });
                out.on('error', (err: any) => {
                    res.writeHead(500);
                    res.end(String(err));
                });
                out.write(body);
                out.end();
            });
        });

        server.listen(port, '127.0.0.1', () => {
            _embeddedProxyServer = server;
            const proxyUrl = `http://127.0.0.1:${port}/heartbeat`;
            try {
                if (pluginThis && pluginThis.settings && pluginThis.settings.store) {
                    pluginThis.settings.store.proxyUrl = proxyUrl;
                }
            } catch (_) {}
            showNotification({ title: 'WakaTime', body: `Embedded proxy listening at ${proxyUrl}` });
        });
    } catch (err) {
        showNotification({ title: 'WakaTime', body: 'Failed to start embedded proxy.' });
        console.warn('WakaTime: failed to start embedded proxy', err);
    }
}

function stopEmbeddedProxy() {
    try {
        if (_embeddedProxyServer) {
            _embeddedProxyServer.close();
            _embeddedProxyServer = null;
        }
    } catch (e) {
        console.warn('WakaTime: error stopping embedded proxy', e);
    }
}

async function handleAction() {
    const time = Date.now();
    if (!enoughTimePassed()) return;
    lastHeartbeatAt = time;
    await sendHeartbeat(time);
}

export default definePlugin({
    name: 'wakatime',
    description: 'Wakatime plugin',
    authors: [
        {
            id: 566766267046821888n,
            name: 'Neon',
        },
        {
            id: 1377378882692448427n,
            name: 'Tym',
        },
    ],
    settings,
    start() {
        console.log('Initializing WakaTime plugin v');
        // if (readSetting(this.homeDirectory() + '/.wakatime.cfg', 'settings', 'debug') == 'true') {
        //   this.debug = true;
        //   console.log('WakaTime debug mode enabled');
        // }
        this.handler = handleAction.bind(this);
        document.addEventListener('click', this.handler);
        try {
            if (settings.store.proxyAutoStart) {
                startEmbeddedProxyIfPossible(settings.store.proxyPort || '9525', this);
            }
        } catch (e) {
            console.warn('WakaTime: failed to auto-start embedded proxy', e);
        }
    },
    stop() {
        console.log('Unloading WakaTime plugin');
        document.removeEventListener('click', this.handler);
        stopEmbeddedProxy();
    },
});