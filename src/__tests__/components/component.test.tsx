import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "react-query";

// SettingWindow's useInit() effect calls checkForUpdate(), which hits Tauri
// APIs that don't exist under jsdom and rejects as an unhandled error. Stub it
// so the smoke-render stays clean.
vi.mock("../../utils/update", () => ({ checkForUpdate: vi.fn() }));

import PetCard from "../../ui/components/PetCard";
import { ISpriteConfig } from "../../types/ISpriteConfig";
import { PetCardType } from "../../types/components/type";
import defaultPet from "../../config/pet_config";
import { afterEach } from "node:test";
import SettingWindow from "../../SettingWindow";
// Initialize the shared i18next instance so react-i18next has a backend.
import "../../i18next";

afterEach(() => {
    cleanup();
});

describe("SettingWindow", () => {
    it("should be defined", () => {
        // Reproduce the app's provider tree (main.tsx + App.tsx): QueryClient,
        // Router (useQueryParams -> useLocation) and MantineProvider.
        const queryClient = new QueryClient();
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <MantineProvider>
                        <SettingWindow />
                    </MantineProvider>
                </MemoryRouter>
            </QueryClientProvider>
        );

        expect(screen).toBeDefined();
    });
});

// it("Should render pet card", async () => {
//     const pet: ISpriteConfig = defaultPet[0];

//     const petCardProps = {
//         btnLabel: "test",
//         pet: pet,
//         btnFunction: () => {
//             console.log("output from test");
//         },
//         type: PetCardType.Add,
//     }
//     render(<PetCard {...petCardProps} />);
//     expect(screen.getByText(pet.name)).toBeDefined();
// });