#include <iostream>
using namespace std;

struct DynArr {
    int* data;
    int size;
    int cap;
};

void init(DynArr& d) {
    d.cap = 4;
    d.size = 0;
    d.data = new int[d.cap];
}

void push(DynArr& d, int x) {
    if (d.size == d.cap) {
        int* bigger = new int[d.cap * 2];
        for (int i = 0; i < d.size; i++) bigger[i] = d.data[i];
        delete[] d.data;
        d.data = bigger;
        d.cap *= 2;
    }
    d.data[d.size++] = x;
}

int main() {
    DynArr d;
    init(d);
    int x;
    while (cin >> x) push(d, x);
    cout << d.size << "\n";
    for (int i = d.size - 1; i >= 0; i--) cout << d.data[i] << " ";
    cout << "\n";
    delete[] d.data;
    return 0;
}
