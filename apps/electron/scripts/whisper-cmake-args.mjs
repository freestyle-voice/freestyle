/**
 * CMake arguments for building whisper.cpp / ggml.
 *
 * Linux CI runners (GitHub Actions ubuntu-latest) often have AVX-512. With
 * GGML_NATIVE=ON, ggml uses -march=native and embeds AVX-512 instructions
 * in init paths that run unconditionally — whisper-server then SIGILLs on
 * common consumer CPUs (e.g. Intel 12th/13th gen without AVX-512).
 */

export function getWhisperCmakeArgs({ forBundledRelease = false } = {}) {
  const args = ["..", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"];

  if (process.platform === "linux" && forBundledRelease) {
    args.push("-DGGML_NATIVE=OFF");
  }

  return args;
}
