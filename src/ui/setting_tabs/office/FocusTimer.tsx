import { memo } from "react";
import { Stack, Group, Text, Paper, Button, Badge, RingProgress, Center } from "@mantine/core";
import { IconPlayerPlay, IconPlayerPause, IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useFocusStore } from "../../../hooks/useFocusStore";
import { useTodoStore } from "../../../hooks/useTodoStore";
import { FocusPhase } from "../../../types/IOffice";

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const PHASE_COLORS: Record<string, string> = {
    idle: 'gray', working: 'red', shortBreak: 'teal', longBreak: 'blue',
};
const PHASE_LABELS: Record<string, string> = {
    idle: 'Ready', working: 'Focusing', shortBreak: 'Short Break', longBreak: 'Long Break',
};

function getPhaseTotal(phase: FocusPhase, config: { workDuration: number; shortBreakDuration: number; longBreakDuration: number }) {
    switch (phase) {
        case 'working': return config.workDuration;
        case 'shortBreak': return config.shortBreakDuration;
        case 'longBreak': return config.longBreakDuration;
        default: return config.workDuration;
    }
}

function FocusTimer() {
    const { t } = useTranslation();

    // Fine-grained selectors — only re-render on the values we actually display
    const phase = useFocusStore(s => s.phase);
    const remaining = useFocusStore(s => s.remaining);
    const isPaused = useFocusStore(s => s.isPaused);
    const completedPomodoros = useFocusStore(s => s.completedPomodoros);
    const config = useFocusStore(s => s.config);
    const stats = useFocusStore(s => s.stats);
    const start = useFocusStore(s => s.start);
    const pause = useFocusStore(s => s.pause);
    const resume = useFocusStore(s => s.resume);
    const reset = useFocusStore(s => s.reset);

    const currentTask = useTodoStore(s => s.todos.find(t => t.isCurrent && !t.completed));

    const total = getPhaseTotal(phase, config);
    const progress = phase === 'idle' ? 0 : Math.round(((total - remaining) / total) * 100);

    return (
        <>
        <style>{`
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(0.97); }
            }
        `}</style>
        <Paper
            shadow="md" radius="lg" p="xl" withBorder
            style={{
                background: 'linear-gradient(145deg, var(--mantine-color-body), var(--mantine-color-dark-7))',
                borderColor: `var(--mantine-color-${PHASE_COLORS[phase]}-9)`,
                transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
                boxShadow: phase !== 'idle'
                    ? `0 0 20px color-mix(in srgb, var(--mantine-color-${PHASE_COLORS[phase]}-5) 15%, transparent)`
                    : undefined,
            }}
        >
            <Stack align="center" gap="md">
                {/* Ring Progress with timer inside */}
                <div style={{
                    animation: isPaused ? 'pulse 2s ease-in-out infinite' : undefined,
                }}>
                    <RingProgress
                        size={200}
                        thickness={8}
                        roundCaps
                        sections={[{ value: progress, color: PHASE_COLORS[phase] }]}
                        label={
                            <Center>
                                <Stack align="center" gap={0}>
                                    <Text
                                        size="2.5rem" fw={800} ff="monospace"
                                        c={PHASE_COLORS[phase]}
                                        style={{ lineHeight: 1, transition: 'color 0.3s' }}
                                    >
                                        {formatTime(remaining)}
                                    </Text>
                                    <Badge size="sm" variant="light" color={PHASE_COLORS[phase]} mt={6}>
                                        {t(PHASE_LABELS[phase])}
                                    </Badge>
                                </Stack>
                            </Center>
                        }
                    />
                </div>

                {/* Pomodoro dots */}
                {config.longBreakInterval > 0 && (
                    <Group gap={8}>
                        {Array.from({ length: config.longBreakInterval }).map((_, i) => (
                            <div key={i} style={{
                                width: 12, height: 12, borderRadius: '50%',
                                background: i < completedPomodoros
                                    ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-dark-5)',
                                transition: 'background 0.3s, transform 0.2s',
                                transform: i < completedPomodoros ? 'scale(1.2)' : 'scale(1)',
                                boxShadow: i < completedPomodoros ? '0 0 6px var(--mantine-color-red-4)' : 'none',
                            }} />
                        ))}
                    </Group>
                )}

                {/* Controls */}
                <Group gap="sm">
                    {phase === 'idle' ? (
                        <Button
                            leftSection={<IconPlayerPlay size={18} />}
                            color="red" size="md" radius="xl"
                            onClick={start}
                            style={{ boxShadow: '0 4px 14px rgba(255, 69, 58, 0.3)' }}
                        >
                            {t("Start Focus")}
                        </Button>
                    ) : (
                        <>
                            {isPaused ? (
                                <Button leftSection={<IconPlayerPlay size={16} />} color="teal" radius="xl" onClick={resume}>
                                    {t("Resume")}
                                </Button>
                            ) : (
                                <Button leftSection={<IconPlayerPause size={16} />} variant="light" radius="xl" onClick={pause}>
                                    {t("Pause")}
                                </Button>
                            )}
                            <Button leftSection={<IconRefresh size={16} />} variant="subtle" color="gray" radius="xl" onClick={reset}>
                                {t("Reset")}
                            </Button>
                        </>
                    )}
                </Group>

                {/* Current task */}
                {currentTask && phase === 'working' && (
                    <Text size="sm" c="dimmed" style={{ opacity: 0.8 }}>
                        📋 {currentTask.text}
                    </Text>
                )}

                {/* Stats */}
                <Group justify="space-around" w="100%" mt="xs" pt="sm"
                    style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                    <Stack align="center" gap={2}>
                        <Text size="lg" fw={700} c="red">{stats.todayPomodoros}</Text>
                        <Text size="xs" c="dimmed">{t("Pomodoros")}</Text>
                    </Stack>
                    <Stack align="center" gap={2}>
                        <Text size="lg" fw={700} c="blue">
                            {stats.todayFocusSeconds >= 3600
                                ? `${Math.floor(stats.todayFocusSeconds / 3600)}h ${Math.floor((stats.todayFocusSeconds % 3600) / 60)}m`
                                : `${Math.floor(stats.todayFocusSeconds / 60)}m`
                            }
                        </Text>
                        <Text size="xs" c="dimmed">{t("Focused")}</Text>
                    </Stack>
                </Group>
            </Stack>
        </Paper>
        </>
    );
}

export default memo(FocusTimer);
