#include <iostream>
using namespace std;

long long ucln(long long a, long long b) {
    while (b != 0) {
        long long r = a % b;
        a = b;
        b = r;
    }
    return a;
}

int main() {
    int q;
    cin >> q;
    while (q--) {
        long long a, b;
        cin >> a >> b;
        long long g = ucln(a, b);
        cout << g << " " << a / g * b << "\n";
    }
    return 0;
}
