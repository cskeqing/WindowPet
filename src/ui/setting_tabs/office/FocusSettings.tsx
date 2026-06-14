import { memo, useCallback, useRef, useState } from "react";
import { Stack, Group, Text, Paper, NumberInput, Switch, Collapse, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconSettings } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useFocusStore } from "../../../hooks/useFocusStore";
import { FocusConfig } from "../../../types/IOffice";

let configTimer: ReturnType<typeof setTimeout> | null = null;

function FocusSettings() {
    const { t } = useTranslation();
    const config = useFocusStore(s => s.config);
    const updateConfig = useFocusStore(s => s.updateConfig);
    const [opened, setOpened] = useState(false);

    // Debounced config update for number inputs
    const debouncedUpdate = useCallback((partial: Partial<FocusConfig>) => {
        if (configTimer) clearTimeout(configTimer);
        configTimer = setTimeout(() => updateConfig(partial), 500);
    }, [updateConfig]);

    return (
        <Paper shadow="xs" radius="md" withBorder
            style={{ background: 'var(--mantine-color-body)', overflow: 'hidden' }}
        >
            <UnstyledButton
                onClick={() => setOpened(o => !o)}
                w="100%" p="md"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
                <Group gap="xs">
                    <IconSettings size={16} style={{ opacity: 0.6 }} />
                    <Text fw={600} size="sm">{t("Timer Settings")}</Text>
                </Group>
                <IconChevronDown
                    size={16}
                    style={{
                        transition: 'transform 0.25s ease',
                        transform: opened ? 'rotate(180deg)' : 'rotate(0)',
                        opacity: 0.5,
                    }}
                />
            </UnstyledButton>

            <Collapse in={opened}>
                <Stack gap="sm" px="md" pb="md">
                    <Group grow>
                        <NumberInput
                            label={t("Work (min)")}
                            value={config.workDuration / 60}
                            onChange={(v) => debouncedUpdate({ workDuration: Number(v) * 60 })}
                            min={1} max={120} size="xs" radius="md"
                        />
                        <NumberInput
                            label={t("Short break (min)")}
                            value={config.shortBreakDuration / 60}
                            onChange={(v) => debouncedUpdate({ shortBreakDuration: Number(v) * 60 })}
                            min={1} max={30} size="xs" radius="md"
                        />
                        <NumberInput
                            label={t("Long break (min)")}
                            value={config.longBreakDuration / 60}
                            onChange={(v) => debouncedUpdate({ longBreakDuration: Number(v) * 60 })}
                            min={1} max={60} size="xs" radius="md"
                        />
                    </Group>
                    <NumberInput
                        label={t("Long break after (pomodoros)")}
                        value={config.longBreakInterval}
                        onChange={(v) => debouncedUpdate({ longBreakInterval: Number(v) })}
                        min={2} max={10} size="xs" radius="md"
                        style={{ maxWidth: 200 }}
                    />
                    <Switch
                        label={t("Pet state binding")}
                        description={t("Pets change behavior based on focus phase")}
                        checked={config.enablePetBinding}
                        onChange={(e) => updateConfig({ enablePetBinding: e.currentTarget.checked })}
                        size="sm"
                    />
                    <Switch
                        label={t("Notifications")}
                        description={t("Show notification when phase changes")}
                        checked={config.enableNotification}
                        onChange={(e) => updateConfig({ enableNotification: e.currentTarget.checked })}
                        size="sm"
                    />
                </Stack>
            </Collapse>
        </Paper>
    );
}

export default memo(FocusSettings);
