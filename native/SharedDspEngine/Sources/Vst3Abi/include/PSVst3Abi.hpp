// SPDX-License-Identifier: MIT
// Minimal ABI-compatible subset derived from Steinberg VST 3 pluginterfaces.
// Copyright (c) 2026, Steinberg Media Technologies GmbH

#pragma once

#include <cstdint>
#include <cstring>

namespace ps_vst3_abi {

using int32 = std::int32_t;
using int64 = std::int64_t;
using uint32 = std::uint32_t;
using uint64 = std::uint64_t;
using uint8 = std::uint8_t;
using tresult = std::int32_t;
using TUID = char[16];
using FIDString = const char*;
using TBool = uint8;
using TChar = char16_t;
using String128 = TChar[128];
using ParamValue = double;
using ParamID = uint32;
using UnitID = int32;
using MediaType = int32;
using BusDirection = int32;
using BusType = int32;
using IoMode = int32;
using SpeakerArrangement = uint64;
using Sample32 = float;
using Sample64 = double;
using SampleRate = double;

constexpr tresult kResultOk = 0;
constexpr tresult kResultFalse = 1;
constexpr tresult kInvalidArgument = 2;
constexpr tresult kNotImplemented = 3;
constexpr tresult kInternalError = 4;
constexpr tresult kNotInitialized = 5;
constexpr tresult kOutOfMemory = 6;
constexpr tresult kNoInterface = -1;
constexpr int32 kManyInstances = 0x7fffffff;
constexpr MediaType kAudio = 0;
constexpr BusDirection kInput = 0;
constexpr BusDirection kOutput = 1;
constexpr BusType kMain = 0;
constexpr IoMode kOfflineProcessing = 2;
constexpr int32 kOffline = 2;
constexpr int32 kSample32 = 0;
constexpr SpeakerArrangement kStereo = 3;
constexpr int32 kCanAutomate = 1 << 0;
constexpr int32 kIsReadOnly = 1 << 1;
constexpr int32 kIsHidden = 1 << 4;

class FUnknown {
public:
  virtual tresult queryInterface(const TUID iid, void** object) = 0;
  virtual uint32 addRef() = 0;
  virtual uint32 release() = 0;
};

class IPluginBase : public FUnknown {
public:
  virtual tresult initialize(FUnknown* context) = 0;
  virtual tresult terminate() = 0;
};

class IBStream : public FUnknown {
public:
  virtual tresult read(void* buffer, int32 numBytes, int32* numBytesRead) = 0;
  virtual tresult write(void* buffer, int32 numBytes, int32* numBytesWritten) = 0;
  virtual tresult seek(int64 position, int32 mode, int64* result) = 0;
  virtual tresult tell(int64* position) = 0;
};

struct PFactoryInfo {
  char vendor[64];
  char url[256];
  char email[128];
  int32 flags;
};

struct PClassInfo {
  TUID cid;
  int32 cardinality;
  char category[32];
  char name[64];
};

struct PClassInfo2 {
  TUID cid;
  int32 cardinality;
  char category[32];
  char name[64];
  uint32 classFlags;
  char subCategories[128];
  char vendor[64];
  char version[64];
  char sdkVersion[64];
};

class IPluginFactory : public FUnknown {
public:
  virtual tresult getFactoryInfo(PFactoryInfo* info) = 0;
  virtual int32 countClasses() = 0;
  virtual tresult getClassInfo(int32 index, PClassInfo* info) = 0;
  virtual tresult createInstance(FIDString cid, FIDString iid, void** object) = 0;
};

class IPluginFactory2 : public IPluginFactory {
public:
  virtual tresult getClassInfo2(int32 index, PClassInfo2* info) = 0;
};

struct BusInfo {
  MediaType mediaType;
  BusDirection direction;
  int32 channelCount;
  String128 name;
  BusType busType;
  uint32 flags;
};

struct RoutingInfo {
  MediaType mediaType;
  int32 busIndex;
  int32 channel;
};

class IComponent : public IPluginBase {
public:
  virtual tresult getControllerClassId(TUID classID) = 0;
  virtual tresult setIoMode(IoMode mode) = 0;
  virtual int32 getBusCount(MediaType type, BusDirection direction) = 0;
  virtual tresult getBusInfo(
      MediaType type, BusDirection direction, int32 index, BusInfo& bus) = 0;
  virtual tresult getRoutingInfo(RoutingInfo& input, RoutingInfo& output) = 0;
  virtual tresult activateBus(
      MediaType type, BusDirection direction, int32 index, TBool state) = 0;
  virtual tresult setActive(TBool state) = 0;
  virtual tresult setState(IBStream* state) = 0;
  virtual tresult getState(IBStream* state) = 0;
};

struct ParameterInfo {
  ParamID id;
  String128 title;
  String128 shortTitle;
  String128 units;
  int32 stepCount;
  ParamValue defaultNormalizedValue;
  UnitID unitID;
  int32 flags;
};

class IComponentHandler;
class IPlugView;

class IEditController : public IPluginBase {
public:
  virtual tresult setComponentState(IBStream* state) = 0;
  virtual tresult setState(IBStream* state) = 0;
  virtual tresult getState(IBStream* state) = 0;
  virtual int32 getParameterCount() = 0;
  virtual tresult getParameterInfo(int32 index, ParameterInfo& info) = 0;
  virtual tresult getParamStringByValue(ParamID id, ParamValue normalized, String128 text) = 0;
  virtual tresult getParamValueByString(ParamID id, TChar* text, ParamValue& normalized) = 0;
  virtual ParamValue normalizedParamToPlain(ParamID id, ParamValue normalized) = 0;
  virtual ParamValue plainParamToNormalized(ParamID id, ParamValue plain) = 0;
  virtual ParamValue getParamNormalized(ParamID id) = 0;
  virtual tresult setParamNormalized(ParamID id, ParamValue normalized) = 0;
  virtual tresult setComponentHandler(IComponentHandler* handler) = 0;
  virtual IPlugView* createView(FIDString name) = 0;
};

struct ProcessSetup {
  int32 processMode;
  int32 symbolicSampleSize;
  int32 maxSamplesPerBlock;
  SampleRate sampleRate;
};

struct AudioBusBuffers {
  int32 numChannels;
  uint64 silenceFlags;
  union {
    Sample32** channelBuffers32;
    Sample64** channelBuffers64;
  };
};

struct ProcessData {
  int32 processMode;
  int32 symbolicSampleSize;
  int32 numSamples;
  int32 numInputs;
  int32 numOutputs;
  AudioBusBuffers* inputs;
  AudioBusBuffers* outputs;
  void* inputParameterChanges;
  void* outputParameterChanges;
  void* inputEvents;
  void* outputEvents;
  void* processContext;
};

class IAudioProcessor : public FUnknown {
public:
  virtual tresult setBusArrangements(
      SpeakerArrangement* inputs, int32 inputCount,
      SpeakerArrangement* outputs, int32 outputCount) = 0;
  virtual tresult getBusArrangement(
      BusDirection direction, int32 index, SpeakerArrangement& arrangement) = 0;
  virtual tresult canProcessSampleSize(int32 symbolicSampleSize) = 0;
  virtual uint32 getLatencySamples() = 0;
  virtual tresult setupProcessing(ProcessSetup& setup) = 0;
  virtual tresult setProcessing(TBool state) = 0;
  virtual tresult process(ProcessData& data) = 0;
  virtual uint32 getTailSamples() = 0;
};

class IHostApplication : public FUnknown {
public:
  virtual tresult getName(String128 name) = 0;
  virtual tresult createInstance(TUID classID, TUID interfaceID, void** object) = 0;
};

class IPlugInterfaceSupport : public FUnknown {
public:
  virtual tresult isPlugInterfaceSupported(const TUID interfaceID) = 0;
};

inline constexpr unsigned char kIPluginFactory2IID[16] = {
    0x00, 0x07, 0xB6, 0x50, 0xF2, 0x4B, 0x4C, 0x0B,
    0xA4, 0x64, 0xED, 0xB9, 0xF0, 0x0B, 0x2A, 0xBB,
};

inline constexpr unsigned char kFUnknownIID[16] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
};
inline constexpr unsigned char kIPluginBaseIID[16] = {
    0x22, 0x88, 0x8D, 0xDB, 0x15, 0x6E, 0x45, 0xAE,
    0x83, 0x58, 0xB3, 0x48, 0x08, 0x19, 0x06, 0x25,
};
inline constexpr unsigned char kIBStreamIID[16] = {
    0xC3, 0xBF, 0x6E, 0xA2, 0x30, 0x99, 0x47, 0x52,
    0x9B, 0x6B, 0xF9, 0x90, 0x1E, 0xE3, 0x3E, 0x9B,
};
inline constexpr unsigned char kIComponentIID[16] = {
    0xE8, 0x31, 0xFF, 0x31, 0xF2, 0xD5, 0x43, 0x01,
    0x92, 0x8E, 0xBB, 0xEE, 0x25, 0x69, 0x78, 0x02,
};
inline constexpr unsigned char kIAudioProcessorIID[16] = {
    0x42, 0x04, 0x3F, 0x99, 0xB7, 0xDA, 0x45, 0x3C,
    0xA5, 0x69, 0xE7, 0x9D, 0x9A, 0xAE, 0xC3, 0x3D,
};
inline constexpr unsigned char kIEditControllerIID[16] = {
    0xDC, 0xD7, 0xBB, 0xE3, 0x77, 0x42, 0x44, 0x8D,
    0xA8, 0x74, 0xAA, 0xCC, 0x97, 0x9C, 0x75, 0x9E,
};
inline constexpr unsigned char kIHostApplicationIID[16] = {
    0x58, 0xE5, 0x95, 0xCC, 0xDB, 0x2D, 0x49, 0x69,
    0x8B, 0x6A, 0xAF, 0x8C, 0x36, 0xA6, 0x64, 0xE5,
};
inline constexpr unsigned char kIPlugInterfaceSupportIID[16] = {
    0x4F, 0xB5, 0x8B, 0x9E, 0x9E, 0xAA, 0x4E, 0x0F,
    0xAB, 0x36, 0x1C, 0x1C, 0xCC, 0xB5, 0x6F, 0xEA,
};

inline bool iidEqual(const char* left, const unsigned char* right) {
  return left && std::memcmp(left, right, 16) == 0;
}

using GetFactoryProc = IPluginFactory* (*)();
using BundleEntryProc = bool (*)(void* bundle);
using BundleExitProc = bool (*)();

}  // namespace ps_vst3_abi
