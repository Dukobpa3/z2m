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
        e.enum('system_mode', ea.STATE_SET, ['on', 'off'])
            .withDescription('On/Off thermostat'),

        //e.enum('work_state', ea.STATE, ['idle', 'heat']).withDescription('does nothing, enum with one value "hot"'), //does nothing, enum with one value "hot"

        e.numeric('deadzone_temperature', ea.STATE_SET)
            .withUnit('°C')
            .withDescription('The delta between local_temperature and current_heating_setpoint to trigger Heat')
            .withValueMin(1)
            .withValueMax(5)
            .withValueStep(1),

        e.numeric('max_temperature_limit', ea.STATE_SET)
            .withUnit('°C')
            .withDescription(
                'Maximum temperature limit. Cuts the thermostat out regardless of air temperature\
                if the external floor sensor exceeds this temperature. \
                Only used by the thermostat when in AL sensor mode.')
            .withValueMin(45)
            .withValueMax(70),

        e.numeric('current_heating_setpoint', ea.STATE_SET)
            .withUnit('°C')
            .withDescription(
                'Temperature set point. In "program" mode setting this value \
                will heat the floor to needed value regardless other setting then return to program mode. \
                Device also don\'t rewrite this value in program mode \
                and in next "hold" session will recall last manual setpoint. \
                To clean it select "program mode" twice.')
            .withValueMin(1)
            .withValueMax(45)
            .withValueStep(1),

        e.climate()
            .withLocalTemperature(ea.STATE)
            .withLocalTemperatureCalibration(-9, 9, 1, ea.STATE_SET)
            .withRunningState(['idle', 'heat'], ea.STATE) // readonly state
            .withPreset(['hold', 'program']),

        e.temperature_sensor_select(['IN', 'AL', 'OU']),

        e.composite('program', 'program', ea.STATE_SET)
            .withDescription(
                'Schedule will work with "program" preset. In this mode, the device will turn on \
                needed temperature at the needed time \
                and will keep it until the next segment started. \
                \nEach schedule contains 4 segments. All 4 segments should be defined. \
                \nFormat: "hh:mm/tt.t" divided by space symbol (temp selection with step 0.5). \
                \nExample: "06:00/20 11:30/21.5 13:30/22 17:30/23"'
            )
            .withFeature(e.text('week_days', ea.STATE_SET))
            .withFeature(e.text('saturday', ea.STATE_SET))
            .withFeature(e.text('sunday', ea.STATE_SET)),
    ],
    meta: {
        // All datapoints go in here
        tuyaDatapoints: [
            [1, 'system_mode', tuya.valueConverterBasic.lookup({off: false, on: true})],

            [40, 'child_lock', tuya.valueConverter.lockUnlock],

            [26, 'deadzone_temperature', tuya.valueConverter.raw],
            [19, 'max_temperature_limit', tuya.valueConverter.raw],

            [16, 'current_heating_setpoint', tuya.valueConverter.raw],

            [24, 'local_temperature', tuya.valueConverter.divideBy10],
            [27, 'local_temperature_calibration', tuya.valueConverter.localTemperatureCalibration],

            [2, 'preset', tuya.valueConverterBasic.lookup({program: tuya.enum(1), hold: tuya.enum(0)})],
            [36, 'running_state', tuya.valueConverterBasic.lookup({idle: tuya.enum(1), heat: tuya.enum(0)})],
            //[3, 'work_state', tuya.valueConverterBasic.lookup({idle: tuya.enum(0), heat: tuya.enum(1)})],

            

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
                        } else {
                            x = 4;
                            y++;
                        }
                    }

                    return {
                        week_days: r[0],
                        saturday: r[1],
                        sunday: r[2],
                    };
                },
            }],
        ],
    },
    extend: [],
};

module.exports = definition;
