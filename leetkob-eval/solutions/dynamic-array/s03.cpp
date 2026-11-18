#include <iostream>

// tu cai dat lai vector vi de khong cho dung std::vector
namespace ds {
    class vector {
        int* buf = nullptr;
        int n = 0, cap = 0;
    public:
        ~vector() { delete[] buf; }
        void push_back(int x) {
            if (n == cap) {
                int newCap = cap == 0 ? 8 : cap * 2;
                int* tmp = new int[newCap];
                for (int i = 0; i < n; ++i) tmp[i] = buf[i];
                delete[] buf;
                buf = tmp;
                cap = newCap;
            }
            buf[n++] = x;
        }
        int size() const { return n; }
        int operator[](int i) const { return buf[i]; }
    };
}

int main() {
    ds::vector v;
    int x;
    while (std::cin >> x) v.push_back(x);
    std::cout << v.size() << '\n';
    for (int i = v.size() - 1; i >= 0; --i) std::cout << v[i] << ' ';
    std::cout << '\n';
    return 0;
}
