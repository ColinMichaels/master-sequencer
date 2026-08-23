#include "PSVst3Abi.hpp"

static_assert(sizeof(ps_vst3_abi::TBool) == 1);
static_assert(sizeof(ps_vst3_abi::BusInfo) == 276);
static_assert(sizeof(ps_vst3_abi::ParameterInfo) == 792);
static_assert(sizeof(ps_vst3_abi::ProcessSetup) == 24);
static_assert(sizeof(ps_vst3_abi::AudioBusBuffers) == 24);
static_assert(sizeof(ps_vst3_abi::ProcessData) == 80);
