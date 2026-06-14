import { ISpriteConfig } from "./ISpriteConfig";

export type EventValue = boolean | string | ISpriteConfig | number;

export type TRenderEventListener = {
    event: string,
    windowLabel: string,
    payload: {
        dispatchType: DispatchType,
        message: string,
        value: EventValue,
    },
    id: number,
}

export enum EventType {
    SettingWindowToPetOverlay = 'settingWindowToPetOverlay',
}

export enum DispatchType {
    ChangeAppLanguage = 'Change app language',
    ChangeAppTheme = 'Change app theme',
    SwitchAutoWindowStartUp = 'Switch auto window start up',
    SwitchPetAboveTaskbar = 'Switch pet above taskbar',
    SwitchAllowPetInteraction = 'Switch allow pet interaction',
    SwitchAllowPetClimbing = 'Switch allow pet climbing',
    AddPet = 'Add pet',
    RemovePet = 'RemovePet',
    OverridePetScale = 'Override pet scale',
    ChangePetScale = 'Change pet scale',
    FocusPhaseChange = 'Focus phase change',
    FocusTodoCelebrate = 'Focus todo celebrate',
    PetInteractionEnd = 'Pet interaction end',
}