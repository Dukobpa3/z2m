const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const modernExtend = require('zigbee-herdsman-converters/lib/modernExtend');
const e = exposes.presets;
const ea = exposes.access;
const tuya = require('zigbee-herdsman-converters/lib/tuya');

const exposesLocal = {
    hour: (name) => e.numeric(name, ea.STATE_SET).withUnit('h').withValueMin(0).withValueMax(23),
    minute: (name) => e.numeric(name, ea.STATE_SET).withUnit('m').withValueMin(0).withValueMax(59),
    program_temperature: (name) => e.numeric(name, ea.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(35).withValueStep(0.5),
};


const definition = {
    // Since a lot of Tuya devices use the same modelID, but use different datapoints
    // it's necessary to provide a fingerprint instead of a zigbeeModel
    fingerprint: [
        {
            // The model ID from: Device with modelID 'TS0601' is not supported
            // You may need to add \u0000 at the end of the name in some cases
            modelID: 'TS0601',
            // The manufacturer name from: Device with modelID 'TS0601' is not supported.
            manufacturerName: '_TZE204_aoclfnxz',
        },
    ],
    model: 'TS0601_GBZB',
    vendor: 'Moes',
    description: 'Moes BHT series Thermostat (custom integration)',
    fromZigbee: [tuya.fz.datapoints],
    toZigbee: [tuya.tz.datapoints],
    onEvent: tuya.onEventSetTime, // Add this if you are getting no converter for 'commandMcuSyncTime'
    configure: tuya.configureMagicPacket,
    exposes: [
        // Here you should put all functionality that your device exposes
        e.linkquality(),
        e.child_lock(),

        e.numeric('deadzone_temperature', ea.STATE_SET)
            .withUnit('°C')
            .withDescription('The delta between local_temperature and current_heating_setpoint to trigger Heat')
            .withValueMin(1)
            .withValueMax(5)
            .withValueStep(1),

        e.numeric('max_temperature_limit', ea.STATE_SET)
            .withUnit('°C')
            .withDescription('Maximum temperature limit. Cuts the thermostat out regardless of air temperature if the external floor sensor exceeds this temperature. Only used by the thermostat when in AL sensor mode.')
            .withValueMin(45)
            .withValueMax(70),

        e.climate()
            .withSetpoint('current_heating_setpoint', 5, 45, 1, ea.STATE_SET)
            .withLocalTemperature(ea.STATE)
            .withLocalTemperatureCalibration(-9, 9, 1, ea.STATE_SET)
            .withSystemMode(['off', 'heat'], ea.STATE_SET)
            .withRunningState(['idle', 'heat'], ea.STATE)
            .withPreset(['hold', 'program']),

        e.temperature_sensor_select(['IN', 'AL', 'OU']),

        e.composite('program', 'program', ea.STATE_SET)
            .withDescription('Time of day and setpoint to use when in program mode')
            .withFeature(exposesLocal.hour('weekdays_p1_hour'))
            .withFeature(exposesLocal.minute('weekdays_p1_minute'))
            .withFeature(exposesLocal.program_temperature('weekdays_p1_temperature'))
            .withFeature(exposesLocal.hour('weekdays_p2_hour'))
            .withFeature(exposesLocal.minute('weekdays_p2_minute'))
            .withFeature(exposesLocal.program_temperature('weekdays_p2_temperature'))
            .withFeature(exposesLocal.hour('weekdays_p3_hour'))
            .withFeature(exposesLocal.minute('weekdays_p3_minute'))
            .withFeature(exposesLocal.program_temperature('weekdays_p3_temperature'))
            .withFeature(exposesLocal.hour('weekdays_p4_hour'))
            .withFeature(exposesLocal.minute('weekdays_p4_minute'))
            .withFeature(exposesLocal.program_temperature('weekdays_p4_temperature'))
            .withFeature(exposesLocal.hour('saturday_p1_hour'))
            .withFeature(exposesLocal.minute('saturday_p1_minute'))
            .withFeature(exposesLocal.program_temperature('saturday_p1_temperature'))
            .withFeature(exposesLocal.hour('saturday_p2_hour'))
            .withFeature(exposesLocal.minute('saturday_p2_minute'))
            .withFeature(exposesLocal.program_temperature('saturday_p2_temperature'))
            .withFeature(exposesLocal.hour('saturday_p3_hour'))
            .withFeature(exposesLocal.minute('saturday_p3_minute'))
            .withFeature(exposesLocal.program_temperature('saturday_p3_temperature'))
            .withFeature(exposesLocal.hour('saturday_p4_hour'))
            .withFeature(exposesLocal.minute('saturday_p4_minute'))
            .withFeature(exposesLocal.program_temperature('saturday_p4_temperature'))
            .withFeature(exposesLocal.hour('sunday_p1_hour'))
            .withFeature(exposesLocal.minute('sunday_p1_minute'))
            .withFeature(exposesLocal.program_temperature('sunday_p1_temperature'))
            .withFeature(exposesLocal.hour('sunday_p2_hour'))
            .withFeature(exposesLocal.minute('sunday_p2_minute'))
            .withFeature(exposesLocal.program_temperature('sunday_p2_temperature'))
            .withFeature(exposesLocal.hour('sunday_p3_hour'))
            .withFeature(exposesLocal.minute('sunday_p3_minute'))
            .withFeature(exposesLocal.program_temperature('sunday_p3_temperature'))
            .withFeature(exposesLocal.hour('sunday_p4_hour'))
            .withFeature(exposesLocal.minute('sunday_p4_minute'))
            .withFeature(exposesLocal.program_temperature('sunday_p4_temperature'))
    ],
    meta: {
        // All datapoints go in here
        tuyaDatapoints: [
            [40, 'child_lock', tuya.valueConverter.lockUnlock],

            [26, 'deadzone_temperature', tuya.valueConverter.raw],
            [19, 'max_temperature_limit', tuya.valueConverter.raw],

            [16, 'current_heating_setpoint', tuya.valueConverter.raw],

            [24, 'local_temperature', tuya.valueConverter.divideBy10],
            [27, 'local_temperature_calibration', tuya.valueConverter.localTemperatureCalibration],


            [1, 'system_mode', tuya.valueConverterBasic.lookup({off: tuya.enum(0), heat: tuya.enum(1)})],
            [2, 'running_state', tuya.valueConverterBasic.lookup({idle: tuya.enum(0), heat: tuya.enum(1)})],
            [3, 'preset', tuya.valueConverterBasic.lookup({hold: tuya.enum(0), program: tuya.enum(1)})],
            [43, 'sensor', tuya.valueConverterBasic.lookup({IN: tuya.enum(0), AL: tuya.enum(1), OU: tuya.enum(2)})],
        ],
    },
    extend: [

    ],
};

module.exports = definition;
