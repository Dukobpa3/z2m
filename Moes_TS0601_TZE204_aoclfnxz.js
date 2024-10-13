const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const modernExtend = require('zigbee-herdsman-converters/lib/modernExtend');
const e = exposes.presets;
const ea = exposes.access;
const tuya = require('zigbee-herdsman-converters/lib/tuya');
//const {logger} = require("../lib/logger");

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
            .withDescription(
                'Schedule will work with "program" preset. In this mode, the device executes ' +
                'a preset week programming temperature time and temperature. Schedule can contains 12 segments. ' +
                'All 12 segments should be defined. It should be defined in the following format: "hh:mm/tt". ' +
                'Segments should be divided by space symbol. ' +
                'Example: "06:00/20 11:30/21 13:30/22 17:30/23 06:00/24 12:00/23 14:30/22 17:30/21 06:00/19 12:30/20 14:30/21 18:30/20"',
            )
            .withFeature(e.text('week_days', ea.STATE_SET).withDescription(''))
            .withFeature(e.text('saturday', ea.STATE_SET).withDescription(''))
            .withFeature(e.text('sunday', ea.STATE_SET).withDescription(''))
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
            [101, 'program', {
                    to: (v, meta) => {
                        if (!meta.state.program) {
                            //logger.warning(`Existing program state not set.`, 'zhc:legacy:tz:moes_bht_002');
                            return;
                        }

                        /* Merge modified value into existing state and send all over in one go */
                        const newProgram = {
                            // @ts-expect-error ignore
                            ...meta.state.program,
                            ...v,
                        };

                        const regex = /((?<h>[01][0-9]|2[0-3]):(?<m>[0-5][0-9])\/(?<t>[0-3][0-9](\.[0,5]|)))/gm;
                        let arr;
                        let matches = [...newProgram.week_days.matchAll(regex)];
                        if (matches.length === 4) {
                            arr = matches.reduce((arr, m) => {
                                arr.push(parseInt(m.groups.h));
                                arr.push(parseInt(m.groups.m));
                                arr.push(parseFloat(m.groups.t) * 2);
                                return arr;
                            }, []);
                        }

                        matches = [...newProgram.saturday.matchAll(regex)];
                        if (matches.length === 4) {
                            arr = arr.concat(matches.reduce((arr, m) => {
                                arr.push(parseInt(m.groups.h));
                                arr.push(parseInt(m.groups.m));
                                arr.push(parseFloat(m.groups.t) * 2);
                                return arr;
                            }, []));
                        }

                        matches = [...newProgram.sunday.matchAll(regex)];
                        if (matches.length === 4) {
                            arr = arr.concat(matches.reduce((arr, m) => {
                                arr.push(parseInt(m.groups.h));
                                arr.push(parseInt(m.groups.m));
                                arr.push(parseFloat(m.groups.t) * 2);
                                return arr;
                            }, []));
                        }
                        return arr;
                        //logger.warning('Ignoring invalid or incomplete schedule', NS);
                    },
                    from: (v, meta) => {
                        let r = ['', '', ''];

                        let x = 4;
                        let y = 0;
                        for (let i = 0; i < 12; i++) {
                            r[y] += `${v[i * 3].toString().padStart(2, '0')}:${v[i * 3 + 1].toString().padStart(2, '0')}/${v[i * 3 + 2] / 2}`;
                            x--;

                            if (x > 0) {
                                r[y] += ' ';
                            }
                            else {
                                x = 4;
                                y ++;
                            }
                        }

                        return {
                            week_days:r[0],
                            saturday:r[1],
                            sunday:r[2]
                        };
                    },
                },]
        ],
    },
    extend: [],
};

module.exports = definition;
