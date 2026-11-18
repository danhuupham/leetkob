#include <iostream>
using namespace std;

int a[1005], n;

void inNguoc(int i) {
    if (i < 0) return;
    cout << a[i] << ' ';
    inNguoc(i - 1);
}

int main() {
    cin >> n;
    long long s = 0;
    for (int i = 0; i < n; i++) {
        cin >> a[i];
        s += a[i];
    }
    inNguoc(n - 1);
    cout << '\n' << s << '\n';
    return 0;
}
