#include <iostream>
#include <string>

int main() {
  const std::string chunk(65536, 'A');
  for (int i = 0; i < 160; ++i) {
    std::cout.write(chunk.data(), static_cast<std::streamsize>(chunk.size()));
    if (!std::cout) {
      return 1;
    }
  }
  std::cout.flush();
  return 0;
}
