#include <cstddef>
#include <iostream>
#include <new>

int main() {
  const std::size_t sz = 1024ULL * 1024ULL * 1024ULL;
  unsigned char* raw = new (std::nothrow) unsigned char[sz];
  if (!raw) {
    return 1;
  }

  volatile unsigned char* p = raw;
  for (std::size_t i = 0; i < sz; i += 4096) {
    p[i] = static_cast<unsigned char>((i / 4096) & 0xff);
  }

  unsigned long long checksum = 0;
  for (std::size_t i = 0; i < sz; i += 4096) {
    checksum += p[i];
  }

  std::cout << "PWNED " << checksum << '\n';
  delete[] raw;
  return 0;
}
