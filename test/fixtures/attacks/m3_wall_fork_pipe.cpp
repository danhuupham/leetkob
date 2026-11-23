#include <iostream>
#include <unistd.h>

int main() {
  pid_t pid = fork();
  if (pid == 0) {
    // Child intentionally keeps stdout open and sleeps past the wall-clock limit.
    sleep(30);
    std::cout << "PWNED\n" << std::flush;
    _exit(0);
  }
  _exit(0);
}
