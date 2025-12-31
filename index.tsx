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
    // Use try/catch to handle fetch errors (CSP will throw here).
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: body,
            headers: headers,
        });
        const data = await response.text();
        if (response.status < 200 || response.status >= 300) console.warn(`WakaTime API Error ${response.status}: ${data}`);
    } catch (err: any) {
        console.warn('WakaTime: heartbeat failed', err);
        // If the fetch failed due to CSP or other network restrictions, show a helpful notification
        showNotification({
            title: 'WakaTime',
            body: 'Failed to send heartbeat — request blocked by Content Security Policy or network error. Click to open a copyable curl fallback.',
            color: 'var(--red-360)',
            onClick: () => {
                const curl = buildCurlFallback(url, body, headers);
                openModal(modalProps => (
                    <ModalRoot {...modalProps}>
                        <ModalHeader>
                            <Forms.FormTitle tag="h4">WakaTime Heartbeat (Fallback)</Forms.FormTitle>
                        </ModalHeader>
                        <ModalContent>
                            <Forms.FormText style={{ padding: '5px' }}>
                                <TextArea value={curl} onChange={() => {}} />
                            </Forms.FormText>
                        </ModalContent>
                        <ModalFooter>
                            <Button
                                color={Button.Colors.GREY}
                                look={Button.Looks.OUTLINED}
                                onClick={() => {
                                    try {
                                        navigator.clipboard.writeText(curl);
                                        showNotification({ title: 'WakaTime', body: 'Copied curl command to clipboard.' });
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

function buildCurlFallback(url: string, body: string, headers: Record<string, string>) {
    const auth = headers.Authorization ? headers.Authorization : '';
    // Build header flags
    const headerFlags = Object.entries(headers)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');
    // Compact body for shell
    const safeBody = body.replace(/'/g, "'\\''");
    return `curl -X POST '${url}' ${headerFlags} --data '${safeBody}'`;
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
    ],
    settings,
    // It might be likely you could delete these and go make patches above!
    start() {
        console.log('Initializing WakaTime plugin v');
        // if (readSetting(this.homeDirectory() + '/.wakatime.cfg', 'settings', 'debug') == 'true') {
        //   this.debug = true;
        //   console.log('WakaTime debug mode enabled');
        // }
        this.handler = handleAction.bind(this);
        document.addEventListener('click', this.handler);
    },
    stop() {
        console.log('Unloading WakaTime plugin');
        document.removeEventListener('click', this.handler);
    },
});