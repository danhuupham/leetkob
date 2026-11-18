#include <iostream>
#include <string>

typedef std::basic_string<int> Buffer;

int main() {
    Buffer b;
    int x;
    while (std::cin >> x) b += x;
    std::cout << b.size() << "\n";
    for (int i = (int)b.size() - 1; i >= 0; --i) std::cout << b[i] << " ";
    std::cout << "\n";
    return 0;
}
