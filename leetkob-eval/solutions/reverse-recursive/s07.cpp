#include <iostream>
#include <vector>
#include <numeric>
#include <iterator>
#include <algorithm>
using namespace std;

vector<int> v;

void doc(int k) {
    if (k == 0) return;
    int x;
    cin >> x;
    v.push_back(x);
    doc(k - 1);
}

int main() {
    int n;
    cin >> n;
    doc(n);
    copy(v.rbegin(), v.rend(), ostream_iterator<int>(cout, " "));
    cout << "\n";
    cout << accumulate(v.begin(), v.end(), 0LL) << "\n";
    return 0;
}
